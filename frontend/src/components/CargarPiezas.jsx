import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const CargarPiezas = ({ onCargaExitosa }) => {
  const [tropas, setTropas] = useState([]);
  const [tropaSeleccionada, setTropaSeleccionada] = useState(() => {
    return localStorage.getItem('carga_tropaSeleccionada') || '';
  });
  const [piezasTropa, setPiezasTropa] = useState([]);

  const [numeroPieza, setNumeroPieza] = useState('');
  const [pesoEntrada, setPesoEntrada] = useState('');
  const [idEditando, setIdEditando] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const inputNumeroRef = useRef(null);
  const inputPesoRef = useRef(null);

  useEffect(() => {
    const fetchTropas = async () => {
      try {
        const response = await api.get('/tropas/');
        setTropas(response.data);
      } catch (error) {
        console.error('Error al cargar tropas', error);
      }
    };

    fetchTropas();
  }, []);

  const cargarPiezasDeTropa = async (idTropa) => {
    if (!idTropa) {
      setPiezasTropa([]);
      return;
    }

    try {
      const response = await api.get(`/tropas/${idTropa}/piezas/`);
      setPiezasTropa(response.data);
    } catch (error) {
      console.error('Error al cargar las piezas de la tropa', error);
    }
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setNumeroPieza('');
    setPesoEntrada('');
    setMensaje({ texto: '', tipo: '' });
  };

  useEffect(() => {
    localStorage.setItem('carga_tropaSeleccionada', tropaSeleccionada);
    cargarPiezasDeTropa(tropaSeleccionada);
    cancelarEdicion();
  }, [tropaSeleccionada]);

  const activarEdicion = (pieza) => {
    setIdEditando(pieza.id);
    setNumeroPieza(pieza.numero_pieza);
    setPesoEntrada(pieza.peso_entrada_kg);
    setMensaje({ texto: `Corrigiendo pieza Nro ${pieza.numero_pieza}.`, tipo: 'success' });
    inputNumeroRef.current?.focus();
  };

  const handleCargarPieza = async () => {
    if (!tropaSeleccionada) {
      setMensaje({ texto: 'Primero selecciona una tropa.', tipo: 'error' });
      return;
    }

    if (!numeroPieza || !pesoEntrada) {
      setMensaje({ texto: 'Completa numero y peso de entrada.', tipo: 'error' });
      return;
    }

    try {
      if (idEditando) {
        await api.put(`/piezas/${idEditando}`, {
          numero_pieza: parseInt(numeroPieza, 10),
          peso_entrada_kg: parseFloat(pesoEntrada),
        });

        setMensaje({ texto: `Pieza ${numeroPieza} actualizada correctamente.`, tipo: 'success' });
        setIdEditando(null);
      } else {
        await api.post(`/tropas/${tropaSeleccionada}/piezas/`, {
          numero_pieza: parseInt(numeroPieza, 10),
          peso_entrada_kg: parseFloat(pesoEntrada),
        });

        setMensaje({ texto: `Pieza ${numeroPieza} ingresada con ${pesoEntrada} Kg.`, tipo: 'success' });

        if (onCargaExitosa) {
          onCargaExitosa();
        }
      }

      cargarPiezasDeTropa(tropaSeleccionada);
      setNumeroPieza('');
      setPesoEntrada('');
      inputNumeroRef.current.focus();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al procesar la pieza';
      setMensaje({ texto: errorMsg, tipo: 'error' });
      inputNumeroRef.current.focus();
    }
  };

  const handleKeyDownNumero = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (numeroPieza) {
        inputPesoRef.current.focus();
      }
    }
  };

  const handleKeyDownPeso = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCargarPieza();
    }
  };

  return (
    <div className="page-container">
      <section className="card card-elevated content-block">
        <h2>Carga Rapida de Piezas</h2>

        <div className="field-block">
          <label htmlFor="tropa-carga">1. Seleccionar Tropa</label>
          <select
            id="tropa-carga"
            value={tropaSeleccionada}
            onChange={(e) => setTropaSeleccionada(e.target.value)}
          >
            <option value="">Elige una tropa</option>
            {tropas.map((tropa) => (
              <option key={tropa.id} value={tropa.id}>
                {tropa.numero_tropa} - {tropa.matadero}
              </option>
            ))}
          </select>
        </div>

        {tropaSeleccionada && (
          <div
            className="section-soft"
            style={{
              marginBottom: '15px',
              padding: '15px',
              backgroundColor: idEditando ? '#fff8e7' : undefined,
            }}
          >
            <strong style={{ display: 'block', marginBottom: '10px', color: idEditando ? '#92400e' : '#0f172a' }}>
              {idEditando ? 'Modo Edicion Activo' : '2. Datos de la Media (teclado rapido)'}
            </strong>

            <div className="inline-row" style={{ gap: '15px' }}>
              <div style={{ flex: 1, minWidth: '170px' }}>
                <label htmlFor="numero-pieza" style={{ fontSize: '13px' }}>Numero de pieza</label>
                <input
                  id="numero-pieza"
                  type="number"
                  value={numeroPieza}
                  onChange={(e) => setNumeroPieza(e.target.value)}
                  onKeyDown={handleKeyDownNumero}
                  ref={inputNumeroRef}
                  placeholder="Ej: 10"
                  style={{ textAlign: 'center', fontSize: '20px', fontWeight: '700' }}
                />
              </div>

              <div style={{ flex: 1, minWidth: '170px' }}>
                <label htmlFor="peso-entrada" style={{ fontSize: '13px' }}>Peso Entrada (Kg)</label>
                <input
                  id="peso-entrada"
                  type="number"
                  step="0.01"
                  value={pesoEntrada}
                  onChange={(e) => setPesoEntrada(e.target.value)}
                  onKeyDown={handleKeyDownPeso}
                  ref={inputPesoRef}
                  placeholder="Ej: 115.4"
                  style={{ textAlign: 'center', fontSize: '20px', fontWeight: '700' }}
                />
              </div>
            </div>

            <div className="inline-row" style={{ marginTop: '15px' }}>
              <button
                onClick={handleCargarPieza}
                className={`btn-lg ${idEditando ? 'btn-warning' : 'btn-success'}`}
                style={{ flex: 1 }}
              >
                {idEditando ? 'Actualizar Pieza (Enter)' : 'Ingresar Media Completa (Enter)'}
              </button>

              {idEditando && (
                <button onClick={cancelarEdicion} className="btn-lg btn-secondary">
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`}>
            {mensaje.texto}
          </div>
        )}
      </section>

      {tropaSeleccionada && (
        <section className="card content-block">
          <h3>Piezas de esta Tropa ({piezasTropa.length} cargadas)</h3>

          {piezasTropa.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic' }}>Aun no hay piezas cargadas en esta tropa.</p>
          ) : (
            <div style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '8px' }}>
              <table className="table-modern" style={{ textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th># Pieza</th>
                    <th>Peso Entrada</th>
                    <th>Accion</th>
                  </tr>
                </thead>
                <tbody>
                  {piezasTropa.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: '700', fontSize: '18px' }}>{p.numero_pieza}</td>
                      <td style={{ color: '#475569' }}>{p.peso_entrada_kg} kg</td>
                      <td>
                        <button onClick={() => activarEdicion(p)} className="btn-sm btn-primary">
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CargarPiezas;
