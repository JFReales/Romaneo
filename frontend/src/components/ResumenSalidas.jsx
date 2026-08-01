import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import Combobox from './Combobox';


const hoyISO = new Date().toISOString().slice(0, 10);

const ResumenSalidas = () => {
  const [fechaDesde, setFechaDesde] = useState(hoyISO);
  const [fechaHasta, setFechaHasta] = useState(hoyISO);
  const [cliente, setCliente] = useState('');
  const [clientes, setClientes] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const prestamosPorOrigen = useMemo(() => {
    const grupos = new Map();
    const prestamos = [...(datos?.prestamos || [])].sort((a, b) => (
      a.razon_social_origen.localeCompare(b.razon_social_origen, 'es')
      || a.razon_social_destino.localeCompare(b.razon_social_destino, 'es')
    ));

    prestamos.forEach((prestamo) => {
      const origen = prestamo.razon_social_origen;
      if (!grupos.has(origen)) {
        grupos.set(origen, {
          origen,
          kilos: 0,
          kilosToro: 0,
          kilosNovVaq: 0,
          movimientos: 0,
          items: {},
          prestamos: [],
        });
      }

      const grupo = grupos.get(origen);
      grupo.kilos += prestamo.kilos;
      grupo.kilosToro += prestamo.kilos_toro || 0;
      grupo.kilosNovVaq += prestamo.kilos_nov_vaq || 0;
      grupo.movimientos += prestamo.movimientos;
      grupo.prestamos.push(prestamo);
      Object.entries(prestamo.items).forEach(([tipo, cantidad]) => {
        grupo.items[tipo] = (grupo.items[tipo] || 0) + cantidad;
      });
    });

    return Array.from(grupos.values()).map((grupo) => ({
      ...grupo,
      kilos: Math.round((grupo.kilos + Number.EPSILON) * 100) / 100,
      kilosToro: Math.round((grupo.kilosToro + Number.EPSILON) * 100) / 100,
      kilosNovVaq: Math.round((grupo.kilosNovVaq + Number.EPSILON) * 100) / 100,
    }));
  }, [datos]);

  const paramsFechas = () => {
    const params = {};
    if (fechaDesde) params.fecha_desde = fechaDesde;
    if (fechaHasta) params.fecha_hasta = fechaHasta;
    return params;
  };

  const cargarClientes = async () => {
    try {
      const res = await api.get('/salidas/clientes', { params: paramsFechas() });
      setClientes(res.data.clientes || []);
    } catch {
      setClientes([]);
    }
  };

  const cargarResumen = async () => {
    setCargando(true);
    setError('');
    try {
      const params = paramsFechas();
      if (cliente.trim()) params.cliente = cliente.trim();
      const res = await api.get('/salidas/resumen', { params });
      setDatos(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el resumen.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarResumen();
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarClientes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta]);

  const Celda = ({ fila, campo }) => (
    <td className="metric-cell">
      <strong>{fila[campo]}</strong>
      <small>{fila[`${campo}_kg`]} kg</small>
    </td>
  );

  return (
    <div className="page-container page-container-full">
      <section className="card card-elevated content-block report-filter">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Movimientos por cliente</span>
            <h2>Resumen de salidas</h2>
          </div>
        </div>

        <div className="filter-grid">
          <div className="field-block">
            <label>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div className="field-block">
            <label>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
          <Combobox
            id="cliente-resumen"
            label="Cliente"
            value={cliente}
            onChange={setCliente}
            options={clientes}
            placeholder="Escribí o elegí un cliente"
            clearLabel="Todos los clientes"
          />
          <button type="button" className="btn-lg btn-primary" onClick={cargarResumen}>Aplicar filtros</button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </section>

      {cargando && <section className="card content-block">Cargando resumen...</section>}

      {datos && !cargando && (
        <>
          <section className="summary-cards">
            <article className="summary-card"><span>Movimientos</span><strong>{datos.resumen.registros}</strong></article>
            <article className="summary-card"><span>Clientes</span><strong>{datos.resumen.clientes}</strong></article>
            <article className="summary-card"><span>Kilos salidos</span><strong>{datos.resumen.kilos_totales}</strong><small>kg</small></article>
            <article className="summary-card loan"><span>Carne prestada</span><strong>{datos.resumen.kilos_prestados}</strong><small>kg · {datos.resumen.prestamos} mov.</small></article>
          </section>

          <section className="card content-block">
            <h3>Totales por cliente</h3>
            {datos.por_cliente.length === 0 ? (
              <p className="empty-copy">No hay salidas para estos filtros.</p>
            ) : (
              <div className="table-scroll">
                <table className="table-modern report-table">
                  <thead>
                    <tr>
                      <th>Clientes</th>
                      <th>Medias</th>
                      <th>Espaldas</th>
                      <th>Piernas</th>
                      <th>Rueda</th>
                      <th>Media Toro</th>
                      <th>Espaldas Toro</th>
                      <th>Piernas Toro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.por_cliente.map((fila) => (
                      <tr key={fila.cliente}>
                        <td><strong>{fila.cliente}</strong><small className="block-copy">{fila.kilos} kg totales</small></td>
                        <Celda fila={fila} campo="medias" />
                        <Celda fila={fila} campo="espaldas" />
                        <Celda fila={fila} campo="piernas" />
                        <Celda fila={fila} campo="rueda" />
                        <Celda fila={fila} campo="media_toro" />
                        <Celda fila={fila} campo="espaldas_toro" />
                        <Celda fila={fila} campo="piernas_toro" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="table-note">Completo y Vacío se conservan como ítems propios en el detalle de movimientos.</p>
          </section>

          <section className="card content-block">
            <div className="section-heading compact">
              <div>
                <span className="eyebrow">Lectura consolidada</span>
                <h3>Detalle unificado de préstamos</h3>
              </div>
              <span className="loan-badge">Agrupado por origen</span>
            </div>
            {prestamosPorOrigen.length === 0 ? (
              <p className="empty-copy">No se detectaron préstamos en el período.</p>
            ) : (
              <div className="loan-origin-list">
                {prestamosPorOrigen.map((grupo) => (
                  <article className="loan-origin-block" key={grupo.origen}>
                    <header className="loan-origin-heading">
                      <div>
                        <span>Razón social de origen</span>
                        <strong>{grupo.origen}</strong>
                      </div>
                      <div className="loan-origin-total">
                        <strong>{grupo.kilos} kg</strong>
                        <span>{grupo.movimientos} movimientos</span>
                        <small className="block-copy">Nov/Vaq: {grupo.kilosNovVaq} kg · Toro: {grupo.kilosToro} kg</small>
                      </div>
                    </header>
                    <div className="table-scroll">
                      <table className="table-modern loan-origin-table">
                        <thead>
                          <tr>
                            <th>Destino</th>
                            <th>Kilos</th>
                            <th>Movimientos</th>
                            <th>Piezas prestadas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupo.prestamos.map((prestamo) => (
                            <tr key={`${prestamo.razon_social_origen}-${prestamo.razon_social_destino}`}>
                              <td><strong>{prestamo.razon_social_destino}</strong></td>
                              <td>
                                <strong>{prestamo.kilos} kg</strong>
                                <small className="block-copy">Nov/Vaq: {prestamo.kilos_nov_vaq} kg · Toro: {prestamo.kilos_toro} kg</small>
                              </td>
                              <td>{prestamo.movimientos}</td>
                              <td>{Object.entries(prestamo.items).map(([tipo, cantidad]) => `${tipo}: ${cantidad}`).join(' / ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card content-block">
            <div className="section-heading compact">
              <h3>Préstamos por relación</h3>
              <span className="loan-badge">Origen &rarr; destino</span>
            </div>
            {prestamosPorOrigen.length === 0 ? (
              <p className="empty-copy">No se detectaron préstamos en el período.</p>
            ) : (
              <div className="loan-grid">
                {prestamosPorOrigen.flatMap((grupo) => grupo.prestamos.map((prestamo) => (
                  <article className="loan-card" key={`${prestamo.razon_social_origen}-${prestamo.razon_social_destino}`}>
                    <span>{prestamo.razon_social_origen}</span>
                    <strong>&rarr; {prestamo.razon_social_destino}</strong>
                    <p>{prestamo.kilos} kg · {prestamo.movimientos} movimientos</p>
                    <small>Nov/Vaq: {prestamo.kilos_nov_vaq} kg · Toro: {prestamo.kilos_toro} kg</small>
                    <small>{Object.entries(prestamo.items).map(([tipo, cantidad]) => `${tipo}: ${cantidad}`).join(' · ')}</small>
                  </article>
                )))}
              </div>
            )}
          </section>

          <section className="card content-block">
            <h3>Detalle de movimientos</h3>
            <div className="table-scroll">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Cliente</th><th>Ítem</th>
                    <th>Kg caliente</th><th>Kg frío</th><th>% Merma</th>
                    <th>Tropa / pieza</th><th>Campo</th><th>Destino razón social</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.detalle.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.fecha_salida).toLocaleDateString('es-AR')}</td>
                      <td>{item.cliente}</td>
                      <td>{item.tipo === 'Vacio' ? 'Vacío' : item.tipo}{item.es_toro ? ' Toro' : ''}</td>
                      <td>{item.kg_caliente_estimado != null ? `${item.kg_caliente_estimado} kg` : '—'}</td>
                      <td>{item.peso_kg} kg</td>
                      <td>{item.merma_pct != null ? `${item.merma_pct}%` : '—'}</td>
                      <td>{item.numero_tropa} / {item.numero_pieza}</td>
                      <td>{item.campo || 'Sin proveedor'}</td>
                      <td>{item.razon_social_destino}{item.es_prestamo && <span className="loan-dot">Préstamo</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default ResumenSalidas;
