import { useEffect, useState } from 'react';
import api from '../api';


const hoyISO = new Date().toISOString().slice(0, 10);

const TablaExistencia = ({ titulo, filas, descripcion }) => (
  <section className="card content-block inventory-section">
    <div className="section-heading compact">
      <div>
        <h3>{titulo}</h3>
        <p>{descripcion}</p>
      </div>
      <span className="status-pill">{filas.length} grupos</span>
    </div>
    {filas.length === 0 ? (
      <p className="empty-copy">No hay existencia para mostrar.</p>
    ) : (
      <div className="table-scroll">
        <table className="table-modern inventory-table">
          <thead>
            <tr>
              <th>Matadero</th><th>Razón social</th><th>Medias</th><th>Piernas</th><th>Espaldas</th>
              <th>Medias Toro</th><th>Piernas Toro</th><th>Espaldas Toro</th><th>Kg estimados</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => (
              <tr key={`${fila.matadero}-${fila.firma}`}>
                <td><strong>{fila.matadero}</strong></td>
                <td>{fila.firma}</td>
                <td>{fila.medias}</td>
                <td>{fila.piernas}</td>
                <td>{fila.espaldas}</td>
                <td>{fila.media_toro}</td>
                <td>{fila.piernas_toro}</td>
                <td>{fila.espaldas_toro}</td>
                <td><strong>{fila.kilos_estimados} kg</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);


const DashboardPrincipal = () => {
  const [fecha, setFecha] = useState(hoyISO);
  const [existencia, setExistencia] = useState(null);
  const [prestamos, setPrestamos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    setCargando(true);
    setError('');
    try {
      const [resExistencia, resPrestamos] = await Promise.all([
        api.get('/existencias/diarias', { params: { fecha } }),
        api.get('/prestamos/resumen', { params: { fecha_desde: fecha, fecha_hasta: fecha } }),
      ]);
      setExistencia(resExistencia.data);
      setPrestamos(resPrestamos.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'No se pudo cargar la existencia diaria.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page-container page-container-full dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Romaneo · control diario</span>
          <h1>Existencia por matadero</h1>
          <p>Medias y cortes disponibles, discriminados por razón social y toros.</p>
        </div>
        <div className="dashboard-date">
          <label>Existencia al día</label>
          <div className="inline-row">
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <button type="button" className="btn-md btn-primary" onClick={cargar}>Actualizar</button>
          </div>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {cargando && <section className="card content-block">Calculando existencias...</section>}

      {existencia && !cargando && (
        <>
          <section className="summary-cards inventory-totals">
            <article className="summary-card"><span>Medias</span><strong>{existencia.totales.medias}</strong></article>
            <article className="summary-card"><span>Piernas</span><strong>{existencia.totales.piernas}</strong></article>
            <article className="summary-card"><span>Espaldas</span><strong>{existencia.totales.espaldas}</strong></article>
            <article className="summary-card bull"><span>Medias Toro</span><strong>{existencia.totales.media_toro}</strong></article>
            <article className="summary-card"><span>Kg estimados</span><strong>{existencia.totales.kilos_estimados}</strong><small>kg</small></article>
          </section>

          <TablaExistencia
            titulo="Firmas propias"
            descripcion="Erre de Mayoristas, Ganadera Roberto Graziotin y Hacienda de Raza."
            filas={existencia.propias}
          />
          <TablaExistencia
            titulo="Existencia de terceros"
            descripcion="Existencia externa separada de las razones sociales propias."
            filas={existencia.terceros}
          />
        </>
      )}

      {prestamos && !cargando && (
        <section className="card content-block">
          <div className="section-heading compact">
            <div>
              <h3>Préstamos del día</h3>
              <p>{prestamos.kilos} kg en {prestamos.movimientos} movimientos.</p>
            </div>
            <span className="loan-badge">Entre razones sociales</span>
          </div>
          {prestamos.detalle.length === 0 ? (
            <p className="empty-copy">No hubo préstamos registrados en esta fecha.</p>
          ) : (
            <div className="loan-grid">
              {prestamos.detalle.map((item) => (
                <article className="loan-card" key={`${item.razon_social_origen}-${item.razon_social_destino}`}>
                  <span>{item.razon_social_origen}</span>
                  <strong>→ {item.razon_social_destino}</strong>
                  <p>{item.kilos} kg · {item.movimientos} movimientos</p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default DashboardPrincipal;
