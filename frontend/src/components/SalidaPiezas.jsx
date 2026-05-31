import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const SalidaPiezas = () => {
  const [tropas, setTropas] = useState([]);
  const [tropaSeleccionada, setTropaSeleccionada] = useState('');
  const [clientes, setClientes] = useState([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');

  const [numeroPieza, setNumeroPieza] = useState('');
  const [piezaInfo, setPiezaInfo] = useState(null);

  const [pesoCamara, setPesoCamara] = useState('');
  const [modo, setModo] = useState('Media Completa');
  const [corteASalir, setCorteASalir] = useState('Ambos');
  const [pesoPierna, setPesoPierna] = useState('');
  const [pesoEspalda, setPesoEspalda] = useState('');

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const inputNumeroRef = useRef(null);
  const inputPesoCamaraRef = useRef(null);
  const inputPesoCorteRef = useRef(null);

  useEffect(() => {
    const cargarIniciales = async () => {
      try {
        const resT = await api.get('/tropas/');
        setTropas(resT.data);
        const resC = await api.get('/clientes/');
        setClientes(resC.data);
      } catch (error) {
        console.error(error);
      }
    };

    cargarIniciales();
  }, []);

  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()),
  );

  const verificarPieza = async () => {
    if (!tropaSeleccionada || !numeroPieza) {
      return;
    }

    setMensaje({ texto: '', tipo: '' });
    setPiezaInfo(null);

    try {
      const res = await api.get(`/tropas/${tropaSeleccionada}/piezas/${numeroPieza}/status`);
      const data = res.data;
      setPiezaInfo(data);

      if (data.peso_salida_camara_kg) {
        const totalCamara = data.peso_salida_camara_kg;
        setPesoCamara(totalCamara);
        setModo('Fraccionada');

        if (data.en_stock_pierna && !data.en_stock_espalda) {
          setCorteASalir('Pierna');
          const diferencia = (totalCamara - data.peso_salida_espalda_kg).toFixed(2);
          setPesoPierna(diferencia);
          setPesoEspalda('');
        } else if (data.en_stock_espalda && !data.en_stock_pierna) {
          setCorteASalir('Espalda');
          const diferencia = (totalCamara - data.peso_salida_pierna_kg).toFixed(2);
          setPesoEspalda(diferencia);
          setPesoPierna('');
        }

        setTimeout(() => inputPesoCorteRef.current?.focus(), 100);
      } else {
        setPesoCamara('');
        setPesoPierna('');
        setPesoEspalda('');
        setModo('Media Completa');
        setCorteASalir('Ambos');
        setTimeout(() => inputPesoCamaraRef.current?.focus(), 100);
      }
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'Error al buscar la pieza.', tipo: 'error' });
      inputNumeroRef.current.focus();
    }
  };

  const handlePesoPiernaChange = (valStr) => {
    setPesoPierna(valStr);
    const total = parseFloat(pesoCamara);
    const pPierna = parseFloat(valStr);

    if (!Number.isNaN(total) && !Number.isNaN(pPierna)) {
      setPesoEspalda(Math.max(0, total - pPierna).toFixed(2));
    }
  };

  const ejecutarDespacho = async () => {
    if (!clienteSeleccionado) {
      setMensaje({ texto: 'Falta seleccionar el cliente.', tipo: 'error' });
      return;
    }

    if (!piezaInfo) {
      return;
    }

    if (!piezaInfo.peso_salida_camara_kg && parseFloat(pesoCamara) > piezaInfo.peso_entrada_kg) {
      alert(
        `Revisa el peso: salida (${pesoCamara} kg) supera la entrada (${piezaInfo.peso_entrada_kg} kg).`,
      );
      inputPesoCamaraRef.current.focus();
      return;
    }

    try {
      await api.post('/piezas/salida-rafaga/', {
        tropa_id: parseInt(tropaSeleccionada, 10),
        numero_pieza: parseInt(numeroPieza, 10),
        destino: clienteSeleccionado,
        modo,
        peso_salida_camara_kg: pesoCamara ? parseFloat(pesoCamara) : null,
        corte_a_salir: corteASalir,
        peso_corte_especifico:
          corteASalir === 'Ambos' || corteASalir === 'Pierna'
            ? parseFloat(pesoPierna)
            : parseFloat(pesoEspalda),
      });

      setMensaje({ texto: `Pieza Nro ${numeroPieza} despachada correctamente.`, tipo: 'success' });

      setNumeroPieza('');
      setPiezaInfo(null);
      setPesoCamara('');
      setPesoPierna('');
      setPesoEspalda('');
      inputNumeroRef.current.focus();
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'Error en el despacho.', tipo: 'error' });
    }
  };

  const crearCliente = async () => {
    const res = await api.post('/clientes/', { nombre: busquedaCliente });
    setClientes([...clientes, res.data]);
    setClienteSeleccionado(res.data.nombre);
    setBusquedaCliente(res.data.nombre);
  };

  return (
    <div className="page-container">
      <section className="card card-elevated content-block">
        <h2>Despacho Rapido de Salidas</h2>

        <div className="inline-row" style={{ gap: '15px', marginBottom: '20px' }}>
          <div className="section-soft" style={{ flex: 1, minWidth: '250px', padding: '12px', position: 'relative' }}>
            <label htmlFor="cliente-destino"><strong>1. Cliente Destino</strong></label>
            <input
              id="cliente-destino"
              type="text"
              placeholder="Buscar o crear cliente..."
              value={busquedaCliente}
              onChange={(e) => {
                setBusquedaCliente(e.target.value);
                setClienteSeleccionado('');
              }}
              style={{ marginTop: '5px' }}
            />

            {busquedaCliente && !clienteSeleccionado && (
              <div className="list-popover list-popover-absolute">
                {clientesFiltrados.map((c) => (
                  <div
                    key={c.id}
                    className="list-option"
                    onClick={() => {
                      setClienteSeleccionado(c.nombre);
                      setBusquedaCliente(c.nombre);
                    }}
                  >
                    {c.nombre}
                  </div>
                ))}

                {clientesFiltrados.length === 0 && (
                  <div style={{ padding: '8px' }}>
                    <button className="btn-sm btn-primary" onClick={crearCliente}>
                      Agregar "{busquedaCliente}"
                    </button>
                  </div>
                )}
              </div>
            )}

            {clienteSeleccionado && <div className="status-chip">Destino: {clienteSeleccionado}</div>}
          </div>

          <div className="section-soft" style={{ flex: 1, minWidth: '220px', padding: '12px' }}>
            <label htmlFor="tropa-salida"><strong>2. Tropa Origen</strong></label>
            <select
              id="tropa-salida"
              value={tropaSeleccionada}
              onChange={(e) => setTropaSeleccionada(e.target.value)}
              style={{ marginTop: '5px' }}
            >
              <option value="">Seleccionar Tropa</option>
              {tropas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.numero_tropa} - {t.matadero}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card" style={{ background: '#1e293b', color: '#f8fafc', padding: '20px' }}>
          <label htmlFor="numero-pieza-salida" style={{ fontSize: '18px', color: '#e2e8f0' }}>
            <strong>3. Numero de Pieza</strong>
          </label>
          <input
            id="numero-pieza-salida"
            type="number"
            value={numeroPieza}
            onChange={(e) => setNumeroPieza(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && verificarPieza()}
            ref={inputNumeroRef}
            placeholder="Ingrese n° de pieza"
            className="input-compact"
            style={{ marginLeft: '10px', textAlign: 'center', fontSize: '20px', width: '250px', height: '35px'  }}
          />

          {piezaInfo && (
            <div
              className="card"
              style={{ marginTop: '15px', padding: '15px', background: '#334155', color: '#f8fafc', borderLeft: '5px solid #38bdf8' }}
            >
              <p style={{ margin: 0 }}>
                Entrada: <strong>{piezaInfo.peso_entrada_kg} kg</strong>
              </p>
              {piezaInfo.peso_salida_camara_kg && (
                <p style={{ margin: '5px 0 0 0', color: '#facc15' }}>
                  Peso de camara ya fijado: <strong>{piezaInfo.peso_salida_camara_kg} kg</strong>
                </p>
              )}

              <div style={{ marginTop: '15px' }}>
                <label htmlFor="peso-camara" style={{ display: 'block', fontSize: '14px', color: '#e2e8f0' }}>
                  <strong>Peso Salida de Camara (Kg)</strong>
                </label>
                <input
                  id="peso-camara"
                  type="number"
                  step="0.01"
                  value={pesoCamara}
                  onChange={(e) => setPesoCamara(e.target.value)}
                  disabled={!!piezaInfo.peso_salida_camara_kg}
                  ref={inputPesoCamaraRef}
                  onKeyDown={(e) => e.key === 'Enter' && (modo === 'Media Completa' ? ejecutarDespacho() : null)}
                  style={{ width: '140px', marginTop: '5px', textAlign: 'center', fontSize: '18px' }}
                />
              </div>

              {piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda && (
                <div style={{ marginTop: '15px' }}>
                  <label htmlFor="modo-despacho" style={{ marginRight: '10px', color: '#e2e8f0' }}>
                    <strong>Despacho</strong>
                  </label>
                  <select
                    id="modo-despacho"
                    value={modo}
                    onChange={(e) => setModo(e.target.value)}
                    style={{ width: '220px', display: 'inline-block' }}
                  >
                    <option value="Media Completa">Media Completa</option>
                    <option value="Fraccionada">Fraccionada</option>
                  </select>
                </div>
              )}

              {modo === 'Fraccionada' && (
                <div className="section-soft" style={{ marginTop: '15px', padding: '10px', background: '#475569', borderColor: '#64748b' }}>
                  <label htmlFor="corte-salida" style={{ marginRight: '10px', color: '#f8fafc' }}>
                    <strong>Que corte sale</strong>
                  </label>
                  <select
                    id="corte-salida"
                    value={corteASalir}
                    onChange={(e) => setCorteASalir(e.target.value)}
                    style={{ width: '240px', display: 'inline-block' }}
                  >
                    {piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda && (
                      <option value="Ambos">Ambos (Separados)</option>
                    )}
                    {piezaInfo.en_stock_pierna && <option value="Pierna">Pierna</option>}
                    {piezaInfo.en_stock_espalda && <option value="Espalda">Espalda</option>}
                  </select>

                  {corteASalir === 'Ambos' && (
                    <div className="inline-row" style={{ gap: '15px', marginTop: '10px' }}>
                      <div>
                        <label htmlFor="kg-pierna" style={{ fontSize: '13px', color: '#e2e8f0' }}>Kg Pierna</label>
                        <input
                          id="kg-pierna"
                          type="number"
                          step="0.01"
                          value={pesoPierna}
                          ref={inputPesoCorteRef}
                          onChange={(e) => handlePesoPiernaChange(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && ejecutarDespacho()}
                          style={{ width: '110px', marginTop: '4px' }}
                        />
                      </div>
                      <div>
                        <label htmlFor="kg-espalda" style={{ fontSize: '13px', color: '#e2e8f0' }}>
                          Kg Espalda (Auto)
                        </label>
                        <input
                          id="kg-espalda"
                          type="number"
                          disabled
                          value={pesoEspalda}
                          style={{ width: '110px', marginTop: '4px', background: '#dbeafe', color: '#334155' }}
                        />
                      </div>
                    </div>
                  )}

                  {(corteASalir === 'Pierna' || corteASalir === 'Espalda') && (
                    <div style={{ marginTop: '10px' }}>
                      <label htmlFor="kg-corte" style={{ fontSize: '13px', color: '#e2e8f0' }}>
                        Kg del corte ({corteASalir})
                      </label>
                      <input
                        id="kg-corte"
                        type="number"
                        step="0.01"
                        value={corteASalir === 'Pierna' ? pesoPierna : pesoEspalda}
                        onChange={(e) =>
                          corteASalir === 'Pierna'
                            ? setPesoPierna(e.target.value)
                            : setPesoEspalda(e.target.value)
                        }
                        onKeyDown={(e) => e.key === 'Enter' && ejecutarDespacho()}
                        ref={inputPesoCorteRef}
                        style={{ width: '120px', marginTop: '4px' }}
                      />
                    </div>
                  )}
                </div>
              )}

              <button onClick={ejecutarDespacho} className="btn-lg btn-success" style={{ marginTop: '20px', minWidth: '240px' }}>
                Confirmar Despacho (Enter)
              </button>
            </div>
          )}
        </div>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '15px' }}>
            {mensaje.texto}
          </div>
        )}
      </section>
    </div>
  );
};

export default SalidaPiezas;
