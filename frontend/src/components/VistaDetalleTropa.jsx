import React, { useState, useEffect } from 'react';
import api from '../api';

const VistaDetalleTropa = () => {
  const [tropas, setTropas] = useState([]);
  const [tropaId, setTropaId] = useState('');
  const [datos, setDatos] = useState(null);

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

    try {
      const res = await api.get(`/tropas/${id}/mapa-completo`);
      setDatos(res.data);
    } catch (error) {
      console.error('Error al cargar el mapa', error);
    }
  };

  return (
    <div className="page-container page-container-full">
      <section className="card card-elevated content-block">
        <label htmlFor="tropa-monitor" style={{ display: 'block', marginBottom: '6px' }}>
          <strong>Seleccionar Tropa para Monitorear</strong>
        </label>
        <select
          id="tropa-monitor"
          value={tropaId}
          onChange={(e) => {
            setTropaId(e.target.value);
            cargarMapa(e.target.value);
          }}
          style={{ width: '50%', padding: '8px', fontSize: '16px' }}
        >
          <option value="">Seleccionar</option>
          {tropas.map((t) => (
            <option key={t.id} value={t.id}>
              Tropa {t.numero_tropa} - {t.matadero}
            </option>
          ))}
        </select>
      </section>

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
