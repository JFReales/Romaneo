import { useEffect, useMemo, useState } from 'react';
import api from '../api';
import Combobox from './Combobox';

const COLORES_DISPONIBILIDAD = {
  'Media completa': { background: '#e9f8ef', border: '#c2ebd0', color: '#166534' },
  Pierna: { background: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
  Espalda: { background: '#fef3c7', border: '#fde68a', color: '#92400e' },
};

const VistaDetalleTropa = () => {
  const [tropas, setTropas] = useState([]);
  const [tropaId, setTropaId] = useState('');
  const [busquedaTropa, setBusquedaTropa] = useState('');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const [disponibles, setDisponibles] = useState(null);
  const [cargandoDisponibles, setCargandoDisponibles] = useState(false);
  const [errorDisponibles, setErrorDisponibles] = useState('');

  const tropasPorEtiqueta = useMemo(() => new Map(
    tropas.map((tropa) => [`Tropa ${tropa.numero_tropa} - ${tropa.matadero}`, tropa]),
  ), [tropas]);

  const opcionesTropa = useMemo(
    () => Array.from(tropasPorEtiqueta.keys()),
    [tropasPorEtiqueta],
  );

  useEffect(() => {
    const fetchTropas = async () => {
      const res = await api.get('/tropas/');
      setTropas(res.data);
    };

    fetchTropas();
  }, []);

  const cargarMapa = async (id) => {
    if (!id) {
      return;
    }

    setCargando(true);
    setError('');
    setDatos(null);
    try {
      const res = await api.get(`/tropas/${id}/mapa-completo`);
      setDatos(res.data);
    } catch (error) {
      console.error('Error al cargar el mapa', error);
      setError('No se pudo cargar el detalle de la tropa.');
    } finally {
      setCargando(false);
    }
  };

  const buscarDisponibles = async () => {
    setCargandoDisponibles(true);
    setErrorDisponibles('');
    try {
      const res = await api.get('/piezas/disponibles');
      setDisponibles(res.data);
    } catch (error) {
      console.error('Error al cargar la disponibilidad', error);
      setErrorDisponibles('No se pudo cargar la disponibilidad de piezas.');
    } finally {
      setCargandoDisponibles(false);
    }
  };

  const seleccionarTropa = (etiqueta) => {
    const tropa = tropasPorEtiqueta.get(etiqueta);
    if (!tropa) return;

    setBusquedaTropa(etiqueta);
    setTropaId(String(tropa.id));
    cargarMapa(tropa.id);
  };

  return (
    <div className="page-container page-container-full">
      <section className="card card-elevated content-block">
        <div className="monitor-search-row">
          <Combobox
            id="tropa-monitor"
            label="Buscar tropa para monitorear"
            value={busquedaTropa}
            options={opcionesTropa}
            placeholder="Escribí el número de tropa o el matadero"
            emptyMessage="No hay tropas que coincidan con la búsqueda."
            onChange={(valor) => {
              setBusquedaTropa(valor);
              const seleccionada = tropasPorEtiqueta.get(valor);
              if (!seleccionada || String(seleccionada.id) !== tropaId) {
                setTropaId('');
                setDatos(null);
              }
            }}
            onSelect={seleccionarTropa}
          />
          {tropaId && (
            <span className="selection-status">Tropa seleccionada</span>
          )}

          <button type="button" className="btn-md btn-primary" onClick={buscarDisponibles}>
            Filtrar disponibilidad
          </button>
        </div>
        <p className="field-help">Usá ↑ y ↓ para recorrer los resultados y Enter para seleccionar.</p>
        {cargando && <div className="status-info">Cargando detalle de la tropa...</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {cargandoDisponibles && <div className="status-info">Buscando piezas disponibles...</div>}
        {errorDisponibles && <div className="alert alert-error">{errorDisponibles}</div>}
      </section>

      {disponibles && !cargandoDisponibles && (
        <section className="card content-block" style={{ marginTop: '16px' }}>
          <div className="section-heading compact">
            <div>
              <h3>Disponibilidad en cámara</h3>
              <p>Ordenadas por fecha de ingreso.</p>
            </div>
            <span className="status-pill">{disponibles.total} piezas</span>
          </div>

          {disponibles.piezas.length === 0 ? (
            <p className="empty-copy">No hay piezas disponibles en cámara.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: '12px',
                marginTop: '12px',
              }}
            >
              {disponibles.piezas.map((pieza) => {
                const colores = COLORES_DISPONIBILIDAD[pieza.disponibilidad] || COLORES_DISPONIBILIDAD.Pierna;
                return (
                  <article
                    key={`${pieza.numero_tropa}-${pieza.numero_pieza}`}
                    className="card"
                    style={{ padding: '12px', borderColor: '#cfd9e8' }}
                  >
                    <strong style={{ display: 'block', fontSize: '15px' }}>
                      Tropa {pieza.numero_tropa}
                    </strong>
                    <span style={{ display: 'block', color: '#475569', fontSize: '13px', marginBottom: '8px' }}>
                      Pieza #{pieza.numero_pieza} · {new Date(`${pieza.fecha_ingreso}T00:00:00`).toLocaleDateString('es-AR')}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '5px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 800,
                        background: colores.background,
                        border: `1px solid ${colores.border}`,
                        color: colores.color,
                      }}
                    >
                      {pieza.disponibilidad}{pieza.es_toro ? ' · Toro' : ''}
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {datos && (
        <section className="page-container page-container-full" style={{ gap: '16px' }}>
          <div className="card content-block" style={{ textAlign: 'center', borderBottom: '3px solid #dbe6f7' }}>
            <h2 style={{ marginBottom: '6px' }}>Tropa {datos.numero_tropa} | {datos.matadero}</h2>
            <p style={{ margin: 0, color: '#475569', fontWeight: 700 }}>
              {datos.fecha_ingreso} | {datos.firma}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '18px',
            }}
          >
            {datos.piezas.map((pieza) => (
              <article
                key={pieza.numero_pieza}
                className="card"
                style={{ overflow: 'hidden', borderColor: '#cfd9e8' }}
              >
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1e3a8a, #0f172a)',
                    color: '#ffffff',
                    padding: '11px',
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '20px', fontWeight: 700 }}>Pieza n°{pieza.numero_pieza}</span>
                </div>

                <div
                  className="section-soft"
                  style={{
                    borderRadius: 0,
                    borderLeft: 'none',
                    borderRight: 'none',
                    display: 'flex',
                    justifyContent: 'space-around',
                    padding: '12px',
                  }}
                >
                  <div>
                    <small>ENTRADA</small>
                    <br />
                    <strong>{pieza.peso_entrada} kg</strong>
                  </div>
                  <div>
                    <small>SALIDA CAM.</small>
                    <br />
                    <strong>{pieza.peso_salida_camara || '--'} kg</strong>
                  </div>
                  <div>
                    <small>SALDO</small>
                    <br />
                    <strong>{pieza.saldo_kg} kg</strong>
                  </div>
                </div>

                <div style={{ padding: '12px' }}>
                  <div
                    style={{
                      padding: '9px',
                      borderRadius: '8px',
                      marginBottom: '10px',
                      backgroundColor: pieza.pierna.en_stock ? '#e9f8ef' : '#fdecec',
                      border: pieza.pierna.en_stock ? '1px solid #c2ebd0' : '1px solid #fecaca',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>Pierna:</strong>
                      <span>{pieza.pierna.en_stock ? 'En Camara' : 'Vendida'}</span>
                    </div>
                    {!pieza.pierna.en_stock && (
                      <div style={{ fontSize: '12px', marginTop: '5px', color: '#475569' }}>
                        Cliente: {pieza.pierna.cliente} | Peso: {pieza.pierna.peso} kg
                        <br />
                        Fecha: {pieza.pierna.fecha}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      padding: '9px',
                      borderRadius: '8px',
                      backgroundColor: pieza.espalda.en_stock ? '#e9f8ef' : '#fdecec',
                      border: pieza.espalda.en_stock ? '1px solid #c2ebd0' : '1px solid #fecaca',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>Espalda:</strong>
                      <span>{pieza.espalda.en_stock ? 'En Camara' : 'Vendida'}</span>
                    </div>
                    {!pieza.espalda.en_stock && (
                      <div style={{ fontSize: '12px', marginTop: '5px', color: '#475569' }}>
                        Cliente: {pieza.espalda.cliente} | Peso: {pieza.espalda.peso} kg
                        <br />
                        Fecha: {pieza.espalda.fecha}
                      </div>
                    )}
                  </div>

                  {pieza.salidas?.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid #cbd5e1', paddingTop: '10px' }}>
                      <strong style={{ display: 'block', marginBottom: '7px' }}>Movimientos</strong>
                      {pieza.salidas.map((salida) => (
                        <div
                          key={salida.id}
                          style={{ padding: '8px', marginTop: '6px', borderRadius: '7px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '12px' }}
                        >
                          <strong>{salida.tipo === 'Vacio' ? 'Vacío' : salida.tipo}: {salida.peso_kg} kg</strong>
                          <br />
                          {salida.cliente} · {salida.razon_social_destino}
                          {salida.es_prestamo ? ' · Préstamo' : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default VistaDetalleTropa;
