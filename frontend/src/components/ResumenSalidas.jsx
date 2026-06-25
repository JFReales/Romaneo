import React, { useEffect, useState } from 'react';
import api from '../api';

const hoyISO = new Date().toISOString().slice(0, 10);

const ResumenSalidas = () => {
  const [fechaDesde, setFechaDesde] = useState(hoyISO);
  const [fechaHasta, setFechaHasta] = useState(hoyISO);
  const [cliente, setCliente] = useState('');
  const [clientesConSalida, setClientesConSalida] = useState([]);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargarResumen = async () => {
    setCargando(true);
    setError('');
    try {
      const params = {};
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;
      if (cliente.trim()) params.cliente = cliente.trim();

      const res = await api.get('/salidas/resumen', { params });
      setDatos(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar el resumen.');
    } finally {
      setCargando(false);
    }
  };

  const cargarClientesConSalida = async () => {
    try {
      const params = {};
      if (fechaDesde) params.fecha_desde = fechaDesde;
      if (fechaHasta) params.fecha_hasta = fechaHasta;

      const res = await api.get('/salidas/clientes', { params });
      setClientesConSalida(res.data?.clientes || []);
    } catch (err) {
      setClientesConSalida([]);
    }
  };

  useEffect(() => {
    cargarResumen();
    cargarClientesConSalida();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    cargarClientesConSalida();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fechaDesde, fechaHasta]);

  return (
    <div className="page-container page-container-full">
      <section className="card card-elevated content-block">
        <h2>Resumen de Salidas</h2>

        <div className="inline-row" style={{ alignItems: 'end' }}>
          <div style={{ minWidth: '180px' }}>
            <label>Fecha desde</label>
            <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div style={{ minWidth: '180px' }}>
            <label>Fecha hasta</label>
            <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
          <div style={{ minWidth: '260px', flex: 1 }}>
            <label>Cliente (opcional)</label>
            <input
              type="text"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Escribí o elegí un cliente..."
              list="clientes-salidas-list"
            />
            <datalist id="clientes-salidas-list">
              {clientesConSalida.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <button onClick={cargarResumen} className="btn-lg btn-primary">
            Filtrar
          </button>
        </div>

        {error && <div className="alert alert-error" style={{ marginTop: '12px' }}>{error}</div>}
      </section>

      {cargando && (
        <section className="card content-block">
          <p>Cargando resumen...</p>
        </section>
      )}

      {datos && !cargando && (
        <>
          <section className="inline-row">
            <div className="card content-block" style={{ flex: 1 }}>
              <strong>Registros</strong>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{datos.resumen.registros}</div>
            </div>
            <div className="card content-block" style={{ flex: 1 }}>
              <strong>Clientes</strong>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{datos.resumen.clientes}</div>
            </div>
            <div className="card content-block" style={{ flex: 1 }}>
              <strong>Kilos Totales</strong>
              <div style={{ fontSize: '28px', fontWeight: 800 }}>{datos.resumen.kilos_totales} kg</div>
            </div>
          </section>

          <section className="card content-block">
            <h3>Totales por Cliente</h3>
            {datos.por_cliente.length === 0 ? (
              <p>No hay datos para estos filtros.</p>
            ) : (
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Registros</th>
                    <th>Kilos</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.por_cliente.map((c) => (
                    <tr key={c.cliente}>
                      <td>{c.cliente}</td>
                      <td>{c.registros}</td>
                      <td>{c.kilos} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="card content-block">
            <h3>Detalle de Salidas</h3>
            {datos.detalle.length === 0 ? (
              <p>No hay salidas para mostrar.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Tropa</th>
                      <th>Matadero</th>
                      <th>Pieza</th>
                      <th>Corte</th>
                      <th>Kilos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.detalle.map((d, idx) => (
                      <tr key={`${d.tropa_id}-${d.numero_pieza}-${d.corte}-${idx}`}>
                        <td>{new Date(d.fecha_hora).toLocaleDateString('es-AR')}</td>
                        <td>{d.cliente || 'Sin cliente'}</td>
                        <td>{d.numero_tropa}</td>
                        <td>{d.matadero}</td>
                        <td>{d.numero_pieza}</td>
                        <td>{d.corte}</td>
                        <td>{d.peso_kg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default ResumenSalidas;
