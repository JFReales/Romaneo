import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const toDateInput = (iso) => (iso ? iso.split('T')[0] : '');

const SalidaPiezas = () => {
  const [archivoCSV, setArchivoCSV] = useState(null);
  const [mensajeLote, setMensajeLote] = useState(null);

  const [clientes, setClientes] = useState([]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');

  const [busquedaNumeroPieza, setBusquedaNumeroPieza] = useState('');
  const [piezasEncontradas, setPiezasEncontradas] = useState([]);
  const [piezaInfo, setPiezaInfo] = useState(null);

  const [pesoCamara, setPesoCamara] = useState('');
  const [corteSeleccionado, setCorteSeleccionado] = useState('');
  const [pesoCorteEspecifico, setPesoCorteEspecifico] = useState('');
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [advertenciaDespacho, setAdvertenciaDespacho] = useState('');

  const [corteEditar, setCorteEditar] = useState('');
  const [destinoEdicion, setDestinoEdicion] = useState('');
  const [pesoEdicion, setPesoEdicion] = useState('');
  const [fechaEdicion, setFechaEdicion] = useState('');
  const [mensajeEdicion, setMensajeEdicion] = useState({ texto: '', tipo: '' });

  const inputBusquedaPiezaRef = useRef(null);
  const inputPesoCamaraRef = useRef(null);
  const inputPesoCorteRef = useRef(null);
  const btnCompletaRef = useRef(null);
  const btnPiernaRef = useRef(null);
  const btnEspaldaRef = useRef(null);
  const btnConfirmarRef = useRef(null);

  useEffect(() => {
    const styles = `
      .btn-navegable-teclado:focus {
        outline: 4px solid #facc15 !important;
        outline-offset: 2px;
        box-shadow: 0 0 10px #facc15 !important;
        border-radius: 6px;
      }
      .alert { font-weight: 700; }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);

  useEffect(() => {
    const cargarIniciales = async () => {
      try {
        const res = await api.get('/clientes/');
        setClientes(res.data);
      } catch (error) {
        console.error(error);
      }
    };
    cargarIniciales();
  }, []);

  const clientesFiltrados = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()),
  );

  const cortesDisponibles = piezaInfo
    ? {
      pierna: piezaInfo.en_stock_pierna,
      espalda: piezaInfo.en_stock_espalda,
    }
    : { pierna: false, espalda: false };

  const hayStockParaDespacho = cortesDisponibles.pierna || cortesDisponibles.espalda;
  const hayCortesVendidos = piezaInfo && (!piezaInfo.en_stock_pierna || !piezaInfo.en_stock_espalda);

  const precargarEdicion = (pieza, corte) => {
    setCorteEditar(corte);
    if (corte === 'Pierna') {
      setDestinoEdicion(pieza.destino_pierna || '');
      setPesoEdicion(pieza.peso_salida_pierna_kg ? pieza.peso_salida_pierna_kg.toString() : '');
      setFechaEdicion(toDateInput(pieza.fecha_salida_pierna));
    } else {
      setDestinoEdicion(pieza.destino_espalda || '');
      setPesoEdicion(pieza.peso_salida_espalda_kg ? pieza.peso_salida_espalda_kg.toString() : '');
      setFechaEdicion(toDateInput(pieza.fecha_salida_espalda));
    }
  };

  const limpiarEstadosDePieza = () => {
    setPiezaInfo(null);
    setPesoCamara('');
    setCorteSeleccionado('');
    setPesoCorteEspecifico('');
    setCorteEditar('');
    setDestinoEdicion('');
    setPesoEdicion('');
    setFechaEdicion('');
  };

  const handleKeyDownCliente = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (clientesFiltrados.length > 0) {
        setClienteSeleccionado(clientesFiltrados[0].nombre);
        setBusquedaCliente(clientesFiltrados[0].nombre);
        inputBusquedaPiezaRef.current?.focus();
      }
    }
  };

  const handleBusquedaPiezaChange = async (e) => {
    const valor = e.target.value;
    setBusquedaNumeroPieza(valor);
    limpiarEstadosDePieza();
    setPiezasEncontradas([]);
    setMensaje({ texto: '', tipo: '' });
    setAdvertenciaDespacho('');
    setMensajeEdicion({ texto: '', tipo: '' });

    if (valor.trim() !== '') {
      try {
        const res = await api.get(`/piezas/buscar/${valor}?incluir_vendidas=true`);
        setPiezasEncontradas(res.data);
      } catch (error) {
        console.error('Error buscando pieza', error);
      }
    }
  };

  const handleKeyDownBusquedaPieza = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (piezasEncontradas.length === 1) {
        seleccionarPieza(piezasEncontradas[0]);
      }
    }
  };

  const handleSubirLote = async () => {
    if (!archivoCSV) {
      setMensajeLote({ texto: 'Seleccioná un archivo CSV.', tipo: 'error' });
      return;
    }
    const formData = new FormData();
    formData.append('file', archivoCSV);

    try {
      setMensajeLote({ texto: 'Procesando archivo, por favor espere...', tipo: 'info' });
      const res = await api.post('/piezas/salidas-lote/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setMensajeLote({
        texto: res.data.mensaje,
        tipo: 'success',
        errores: res.data.errores,
        advertencias: res.data.advertencias,
      });
      setArchivoCSV(null);
    } catch (error) {
      setMensajeLote({ texto: error.response?.data?.detail || 'Error al procesar el lote.', tipo: 'error' });
    }
  };

  const seleccionarPieza = (pieza) => {
    setPiezaInfo(pieza);
    setPiezasEncontradas([]);
    setBusquedaNumeroPieza(pieza.numero_pieza.toString());
    setMensaje({ texto: '', tipo: '' });
    setAdvertenciaDespacho('');
    setMensajeEdicion({ texto: '', tipo: '' });

    if (pieza.peso_salida_camara_kg) {
      const totalCamara = Number(pieza.peso_salida_camara_kg);
      setPesoCamara(totalCamara);

      if (pieza.en_stock_pierna && !pieza.en_stock_espalda) {
        setCorteSeleccionado('Pierna');
        setPesoCorteEspecifico((totalCamara - Number(pieza.peso_salida_espalda_kg || 0)).toFixed(2));
        setTimeout(() => inputPesoCorteRef.current?.focus(), 80);
      } else if (pieza.en_stock_espalda && !pieza.en_stock_pierna) {
        setCorteSeleccionado('Espalda');
        setPesoCorteEspecifico((totalCamara - Number(pieza.peso_salida_pierna_kg || 0)).toFixed(2));
        setTimeout(() => inputPesoCorteRef.current?.focus(), 80);
      } else {
        setCorteSeleccionado('');
        setPesoCorteEspecifico('');
        setTimeout(() => btnCompletaRef.current?.focus(), 80);
      }
    } else {
      setPesoCamara('');
      setCorteSeleccionado('');
      setPesoCorteEspecifico('');
      setTimeout(() => inputPesoCamaraRef.current?.focus(), 80);
    }

    if (!pieza.en_stock_pierna) {
      precargarEdicion(pieza, 'Pierna');
    } else if (!pieza.en_stock_espalda) {
      precargarEdicion(pieza, 'Espalda');
    }
  };

  const recargarPiezaActual = async (idPieza, numeroPieza) => {
    const res = await api.get(`/piezas/buscar/${numeroPieza}?incluir_vendidas=true`);
    const actualizada = res.data.find((p) => p.id === idPieza) || null;
    if (actualizada) {
      seleccionarPieza(actualizada);
    } else {
      limpiarEstadosDePieza();
      setBusquedaNumeroPieza('');
    }
  };

  const handleKeyDownPesoCamara = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (btnCompletaRef.current) btnCompletaRef.current.focus();
      else if (btnPiernaRef.current) btnPiernaRef.current.focus();
      else if (btnEspaldaRef.current) btnEspaldaRef.current.focus();
    }
  };

  const handleKeyDownCortes = (e, corteActual) => {
    if (!piezaInfo) return;

    const refsDisponibles = [];
    if (piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda) {
      refsDisponibles.push({ ref: btnCompletaRef, nombre: 'Completa' });
    }
    if (piezaInfo.en_stock_pierna) refsDisponibles.push({ ref: btnPiernaRef, nombre: 'Pierna' });
    if (piezaInfo.en_stock_espalda) refsDisponibles.push({ ref: btnEspaldaRef, nombre: 'Espalda' });

    const indiceActual = refsDisponibles.findIndex((r) => r.nombre === corteActual);
    if (indiceActual < 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const indiceSiguiente = (indiceActual + 1) % refsDisponibles.length;
      refsDisponibles[indiceSiguiente].ref.current?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const indiceSiguiente = (indiceActual - 1 + refsDisponibles.length) % refsDisponibles.length;
      refsDisponibles[indiceSiguiente].ref.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      refsDisponibles[indiceActual].ref.current?.click();
    }
  };

  const ejecutarDespacho = async () => {
    if (!clienteSeleccionado) {
      setMensaje({ texto: 'Falta seleccionar el cliente destino.', tipo: 'error' });
      return;
    }
    if (!piezaInfo) {
      setMensaje({ texto: 'Seleccioná una pieza válida.', tipo: 'error' });
      return;
    }
    if (!hayStockParaDespacho) {
      setMensaje({ texto: 'Esta pieza ya no tiene stock disponible para una nueva salida.', tipo: 'error' });
      return;
    }
    if (!pesoCamara || Number.isNaN(Number(pesoCamara))) {
      setMensaje({ texto: 'Ingresá el peso de salida de cámara.', tipo: 'error' });
      inputPesoCamaraRef.current?.focus();
      return;
    }
    if (!corteSeleccionado) {
      setMensaje({ texto: 'Seleccioná qué corte vas a despachar.', tipo: 'error' });
      return;
    }
    if (
      (corteSeleccionado === 'Pierna' || corteSeleccionado === 'Espalda')
      && (!pesoCorteEspecifico || Number.isNaN(Number(pesoCorteEspecifico)))
    ) {
      setMensaje({ texto: `Ingresá los kilos de la ${corteSeleccionado}.`, tipo: 'error' });
      inputPesoCorteRef.current?.focus();
      return;
    }

    try {
      const res = await api.post('/piezas/salida-rafaga/', {
        tropa_id: piezaInfo.tropa_id,
        numero_pieza: piezaInfo.numero_pieza,
        destino: clienteSeleccionado,
        modo: corteSeleccionado === 'Completa' ? 'Media Completa' : 'Fraccionada',
        peso_salida_camara_kg: Number(pesoCamara),
        corte_a_salir: corteSeleccionado === 'Completa' ? 'Ambos' : corteSeleccionado,
        peso_corte_especifico: corteSeleccionado === 'Completa' ? null : Number(pesoCorteEspecifico),
      });

      setMensaje({ texto: `Pieza Nº ${piezaInfo.numero_pieza} despachada a ${clienteSeleccionado}.`, tipo: 'success' });
      setAdvertenciaDespacho(res.data.advertencia || '');
      setBusquedaNumeroPieza('');
      setPiezasEncontradas([]);
      limpiarEstadosDePieza();
      inputBusquedaPiezaRef.current?.focus();
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'Error en el despacho.', tipo: 'error' });
    }
  };

  const guardarEdicionSalida = async () => {
    if (!piezaInfo) return;
    if (!corteEditar) {
      setMensajeEdicion({ texto: 'Seleccioná el corte a corregir.', tipo: 'error' });
      return;
    }
    if (!destinoEdicion.trim()) {
      setMensajeEdicion({ texto: 'Ingresá el destino corregido.', tipo: 'error' });
      return;
    }
    if (!pesoEdicion || Number.isNaN(Number(pesoEdicion))) {
      setMensajeEdicion({ texto: 'Ingresá un peso válido.', tipo: 'error' });
      return;
    }

    try {
      const res = await api.put(`/piezas/${piezaInfo.id}/salida`, {
        corte: corteEditar,
        destino: destinoEdicion.trim(),
        peso_salida_kg: Number(pesoEdicion),
        fecha_salida: fechaEdicion ? `${fechaEdicion}T00:00:00` : null,
      });

      await recargarPiezaActual(piezaInfo.id, piezaInfo.numero_pieza);
      setMensajeEdicion({ texto: 'Salida corregida correctamente.', tipo: 'success' });
      setAdvertenciaDespacho(res.data.advertencia || '');
    } catch (error) {
      setMensajeEdicion({ texto: error.response?.data?.detail || 'No se pudo actualizar la salida.', tipo: 'error' });
    }
  };

  return (
    <div className="page-container">
      <section className="card card-elevated content-block">
        <h2>Despacho Rápido</h2>

        <div className="inline-row" style={{ gap: '15px', marginBottom: '20px' }}>
          <div className="field-block" style={{ flex: 1, position: 'relative', margin: 0 }}>
            <label><strong>1. Cliente Destino:</strong></label>
            <input
              type="text"
              placeholder="Buscar o crear cliente..."
              value={busquedaCliente}
              onChange={(e) => {
                setBusquedaCliente(e.target.value);
                setClienteSeleccionado('');
              }}
              onKeyDown={handleKeyDownCliente}
              style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box' }}
            />
            {busquedaCliente && !clienteSeleccionado && (
              <div style={{ position: 'absolute', zIndex: 10, width: '100%', backgroundColor: '#0f172a', border: '1px solid #475569', maxHeight: '200px', overflowY: 'auto' }}>
                {clientesFiltrados.map((c) => (
                  <div
                    key={c.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setClienteSeleccionado(c.nombre);
                        setBusquedaCliente(c.nombre);
                        inputBusquedaPiezaRef.current?.focus();
                      }
                    }}
                    onClick={() => {
                      setClienteSeleccionado(c.nombre);
                      setBusquedaCliente(c.nombre);
                      inputBusquedaPiezaRef.current?.focus();
                    }}
                    style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #334155', color: '#f8fafc' }}
                  >
                    {c.nombre}
                  </div>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div style={{ padding: '10px' }}>
                    <button
                      onClick={async () => {
                        const res = await api.post('/clientes/', { nombre: busquedaCliente });
                        setClientes([...clientes, res.data]);
                        setClienteSeleccionado(res.data.nombre);
                        setBusquedaCliente(res.data.nombre);
                        inputBusquedaPiezaRef.current?.focus();
                      }}
                      className="btn-sm btn-primary"
                    >
                      Agregar "{busquedaCliente}"
                    </button>
                  </div>
                )}
              </div>
            )}
            {clienteSeleccionado && (
              <div style={{ color: '#166534', fontWeight: '700', marginTop: '5px' }}>
                Destino fijado: {clienteSeleccionado}
              </div>
            )}
          </div>

          <div className="field-block" style={{ flex: 1, position: 'relative', margin: 0 }}>
            <label><strong>2. Buscar Nº de Pieza:</strong></label>
            <input
              type="number"
              ref={inputBusquedaPiezaRef}
              value={busquedaNumeroPieza}
              onChange={handleBusquedaPiezaChange}
              onKeyDown={handleKeyDownBusquedaPieza}
              placeholder="Tipeá el número..."
              style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '18px', fontWeight: '700' }}
            />
            {piezasEncontradas.length > 0 && !piezaInfo && (
              <div style={{ position: 'absolute', zIndex: 10, width: '100%', backgroundColor: '#0f172a', border: '1px solid #475569', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                {piezasEncontradas.map((p) => (
                  <div
                    key={p.id}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') seleccionarPieza(p); }}
                    onClick={() => seleccionarPieza(p)}
                    style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', color: '#f8fafc' }}
                  >
                    <span><strong>Tropa: {p.numero_tropa}</strong> ({p.matadero})</span>
                    <span style={{ color: '#cbd5e1' }}>{p.peso_entrada_kg} kg</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {piezaInfo && (
          <div className="section-soft" style={{ backgroundColor: '#0f172a', padding: '20px', borderRadius: '8px', border: '1px solid #475569' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '15px', color: '#f8fafc' }}>
              <span style={{ fontSize: '18px' }}>Pieza Nº <strong>{piezaInfo.numero_pieza}</strong></span>
              <span style={{ fontSize: '18px' }}>Entrada: <strong>{piezaInfo.peso_entrada_kg} kg</strong></span>
            </div>

            <div className="field-block" style={{ marginBottom: '20px' }}>
              <label style={{ color: '#f8fafc', fontSize: '15px' }}>
                <strong>3. Peso Salida de Cámara (Kg):</strong>
                {piezaInfo.peso_salida_camara_kg && <span style={{ color: '#fbbf24', marginLeft: '10px' }}>(fijado previamente)</span>}
              </label>
              <input
                type="number"
                step="0.01"
                value={pesoCamara}
                onChange={(e) => setPesoCamara(e.target.value)}
                disabled={!!piezaInfo.peso_salida_camara_kg}
                ref={inputPesoCamaraRef}
                onKeyDown={handleKeyDownPesoCamara}
                placeholder="Peso que marca la balanza..."
                style={{ width: '100%', padding: '12px', fontSize: '20px', textAlign: 'center', fontWeight: '700', marginTop: '5px', boxSizing: 'border-box' }}
              />
            </div>

            {hayStockParaDespacho ? (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ color: '#f8fafc', fontSize: '15px', display: 'block', marginBottom: '10px' }}>
                    <strong>4. ¿Qué vas a despachar?</strong>
                  </label>

                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda && (
                      <button
                        ref={btnCompletaRef}
                        tabIndex={0}
                        className="btn-navegable-teclado"
                        onKeyDown={(e) => handleKeyDownCortes(e, 'Completa')}
                        onClick={() => {
                          setCorteSeleccionado('Completa');
                          setTimeout(() => btnConfirmarRef.current?.focus(), 50);
                        }}
                        style={{ flex: 1, padding: '15px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Completa' ? '3px solid #22c55e' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Completa' ? '#166534' : '#334155', color: '#ffffff' }}
                      >
                        MEDIA COMPLETA
                      </button>
                    )}

                    {piezaInfo.en_stock_pierna && (
                      <button
                        ref={btnPiernaRef}
                        tabIndex={0}
                        className="btn-navegable-teclado"
                        onKeyDown={(e) => handleKeyDownCortes(e, 'Pierna')}
                        onClick={() => {
                          setCorteSeleccionado('Pierna');
                          setTimeout(() => inputPesoCorteRef.current?.focus(), 50);
                        }}
                        style={{ flex: 1, padding: '15px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Pierna' ? '3px solid #3b82f6' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Pierna' ? '#1e3a8a' : '#334155', color: '#ffffff' }}
                      >
                        PIERNA
                      </button>
                    )}

                    {piezaInfo.en_stock_espalda && (
                      <button
                        ref={btnEspaldaRef}
                        tabIndex={0}
                        className="btn-navegable-teclado"
                        onKeyDown={(e) => handleKeyDownCortes(e, 'Espalda')}
                        onClick={() => {
                          setCorteSeleccionado('Espalda');
                          setTimeout(() => inputPesoCorteRef.current?.focus(), 50);
                        }}
                        style={{ flex: 1, padding: '15px', fontWeight: '700', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Espalda' ? '3px solid #eab308' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Espalda' ? '#854d0e' : '#334155', color: '#ffffff' }}
                      >
                        ESPALDA
                      </button>
                    )}
                  </div>
                </div>

                {(corteSeleccionado === 'Pierna' || corteSeleccionado === 'Espalda') && (
                  <div className="field-block" style={{ backgroundColor: '#111827', padding: '15px', borderRadius: '6px', border: '1px solid #3b82f6' }}>
                    <label style={{ color: '#bfdbfe' }}><strong>Kilos de la {corteSeleccionado}:</strong></label>
                    <input
                      type="number"
                      step="0.01"
                      value={pesoCorteEspecifico}
                      onChange={(e) => setPesoCorteEspecifico(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') btnConfirmarRef.current?.focus(); }}
                      ref={inputPesoCorteRef}
                      placeholder="Peso del corte separado..."
                      style={{ width: '100%', padding: '12px', fontSize: '18px', textAlign: 'center', fontWeight: '700', marginTop: '5px', boxSizing: 'border-box' }}
                    />
                    {piezaInfo.peso_salida_camara_kg && (
                      <small style={{ color: '#93c5fd', display: 'block', marginTop: '5px', textAlign: 'center' }}>
                        Valor sugerido por diferencia. Podés editarlo.
                      </small>
                    )}
                  </div>
                )}

                <button
                  ref={btnConfirmarRef}
                  onClick={ejecutarDespacho}
                  tabIndex={0}
                  className="btn-lg btn-success btn-navegable-teclado"
                  style={{ width: '100%', marginTop: '10px', padding: '15px', fontSize: '18px' }}
                >
                  CONFIRMAR DESPACHO
                </button>
              </>
            ) : (
              <div className="alert alert-warning">
                Esta pieza ya está totalmente despachada. Podés corregir destino, fecha o kilos desde el bloque de edición.
              </div>
            )}

            {hayCortesVendidos && (
              <div className="section-soft" style={{ marginTop: '16px', backgroundColor: '#f8fafc', borderColor: '#cbd5e1', padding: '14px' }}>
                <h4 style={{ margin: '0 0 10px 0' }}>Editar salida registrada</h4>
                <div className="inline-row" style={{ marginBottom: '10px' }}>
                  {!piezaInfo.en_stock_pierna && (
                    <button
                      className={`btn-sm ${corteEditar === 'Pierna' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => precargarEdicion(piezaInfo, 'Pierna')}
                    >
                      Editar Pierna
                    </button>
                  )}
                  {!piezaInfo.en_stock_espalda && (
                    <button
                      className={`btn-sm ${corteEditar === 'Espalda' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => precargarEdicion(piezaInfo, 'Espalda')}
                    >
                      Editar Espalda
                    </button>
                  )}
                </div>

                <div className="inline-row">
                  <div style={{ flex: 1, minWidth: '220px' }}>
                    <label>Destino</label>
                    <input value={destinoEdicion} onChange={(e) => setDestinoEdicion(e.target.value)} />
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label>Peso (kg)</label>
                    <input type="number" step="0.01" value={pesoEdicion} onChange={(e) => setPesoEdicion(e.target.value)} />
                  </div>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <label>Fecha salida</label>
                    <input type="date" value={fechaEdicion} onChange={(e) => setFechaEdicion(e.target.value)} />
                  </div>
                </div>

                <button onClick={guardarEdicionSalida} className="btn-md btn-primary" style={{ marginTop: '10px' }}>
                  Guardar corrección
                </button>

                {mensajeEdicion.texto && (
                  <div className={`alert ${mensajeEdicion.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '10px' }}>
                    {mensajeEdicion.texto}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '20px' }}>
            {mensaje.texto}
          </div>
        )}
        {advertenciaDespacho && (
          <div className="alert alert-warning" style={{ marginTop: '10px' }}>
            {advertenciaDespacho}
          </div>
        )}
      </section>

      <div className="section-soft" style={{ marginTop: '4px', padding: '20px', backgroundColor: '#0f172a', border: '1px solid #3b82f6', borderRadius: '8px' }}>
        <h3 style={{ color: '#bfdbfe', marginTop: 0 }}>Carga Masiva desde Archivo (CSV)</h3>
        <p style={{ color: '#e2e8f0', fontSize: '14px', marginBottom: '15px' }}>
          El archivo debe ser <strong>.csv</strong> y contener:
          <br />
          <code style={{ backgroundColor: '#1e293b', padding: '4px', borderRadius: '4px', color: '#f8fafc' }}>
            tropa, pieza, cliente, peso_camara, corte, peso_corte
          </code>
        </p>

        <div className="inline-row" style={{ gap: '15px', alignItems: 'center' }}>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setArchivoCSV(e.target.files[0])}
            style={{ color: '#f8fafc' }}
          />
          <button onClick={handleSubirLote} className="btn-lg btn-primary" style={{ padding: '10px 20px' }}>
            Subir y Procesar Lote
          </button>
        </div>

        {mensajeLote && (
          <div style={{ marginTop: '15px', padding: '15px', borderRadius: '6px', backgroundColor: mensajeLote.tipo === 'error' ? '#7f1d1d' : '#14532d', color: '#ffffff' }}>
            <strong>{mensajeLote.texto}</strong>
            {mensajeLote.errores && mensajeLote.errores.length > 0 && (
              <ul style={{ marginTop: '10px', paddingLeft: '20px', color: '#fecaca' }}>
                {mensajeLote.errores.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            )}
            {mensajeLote.advertencias && mensajeLote.advertencias.length > 0 && (
              <ul style={{ marginTop: '10px', paddingLeft: '20px', color: '#fde68a' }}>
                {mensajeLote.advertencias.map((adv, idx) => (
                  <li key={idx}>{adv}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SalidaPiezas;
