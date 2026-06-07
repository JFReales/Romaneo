import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const SalidaPiezas = () => {

    // 1. (Agregá esto junto con tus otros estados arriba)
    const [archivoCSV, setArchivoCSV] = useState(null);
    const [mensajeLote, setMensajeLote] = useState(null); // Para mostrar resultados del Excel

    // --- ESTADOS DE CLIENTE ---
    const [clientes, setClientes] = useState([]);
    const [busquedaCliente, setBusquedaCliente] = useState('');
    const [clienteSeleccionado, setClienteSeleccionado] = useState('');
    
    // --- ESTADOS DE BÚSQUEDA INVERTIDA (PIEZA) ---
    const [busquedaNumeroPieza, setBusquedaNumeroPieza] = useState('');
    const [piezasEncontradas, setPiezasEncontradas] = useState([]);
    const [piezaInfo, setPiezaInfo] = useState(null); 
    
    // --- ESTADOS DE DESPACHO ---
    const [pesoCamara, setPesoCamara] = useState('');
    const [corteSeleccionado, setCorteSeleccionado] = useState(''); 
    const [pesoCorteEspecifico, setPesoCorteEspecifico] = useState('');
    const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

    // --- REFERENCIAS PARA NAVEGACIÓN POR TECLADO ---
    const inputBusquedaPiezaRef = useRef(null);
    const inputPesoCamaraRef = useRef(null);
    const inputPesoCorteRef = useRef(null);
    const btnCompletaRef = useRef(null);
    const btnPiernaRef = useRef(null);
    const btnEspaldaRef = useRef(null);
    const btnConfirmarRef = useRef(null);

    // --- NUEVO: ESTILOS GLOBALES PARA EL FOCO (VISIBILIDAD) ---
    // Inyectamos este CSS para que los botones tengan un borde amarillo brillante al recibir el foco
    useEffect(() => {
        const styles = `
            .btn-navegable-teclado:focus {
                outline: 4px solid #facc15 !important; /* Amarillo brillante */
                outline-offset: 2px;
                box-shadow: 0 0 10px #facc15 !important;
                border-radius: 6px;
            }
            .alert { font-weight: bold; }
        `;
        const styleSheet = document.createElement("style");
        styleSheet.type = "text/css";
        styleSheet.innerText = styles;
        document.head.appendChild(styleSheet);
        return () => { document.head.removeChild(styleSheet); }; // Limpieza al salir
    }, []);

    useEffect(() => {
        const cargarIniciales = async () => {
            try {
                const resC = await api.get('/clientes/');
                setClientes(resC.data);
            } catch (error) {
                console.error(error);
            }
        };
        cargarIniciales();
    }, []);

    const clientesFiltrados = clientes.filter(c => c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()));

    // --- EVENTOS DE TECLADO: CLIENTE ---
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

    // --- EVENTOS DE TECLADO: PIEZAS ---
    const handleBusquedaPiezaChange = async (e) => {
        const valor = e.target.value;
        setBusquedaNumeroPieza(valor);
        setPiezaInfo(null);
        setPiezasEncontradas([]);
        setCorteSeleccionado('');
        setPesoCamara('');
        setPesoCorteEspecifico('');

        if (valor.trim() !== '') {
            try {
                const res = await api.get(`/piezas/buscar/${valor}`);
                setPiezasEncontradas(res.data);
            } catch (error) {
                console.error("Error buscando pieza", error);
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
          setMensajeLote({ texto: 'Por favor, seleccioná un archivo CSV.', tipo: 'error' });
          return;
      }
           const formData = new FormData();
      formData.append('file', archivoCSV);
           try {
          setMensajeLote({ texto: 'Procesando archivo, por favor espere...', tipo: 'info' });
          const res = await api.post('/piezas/salidas-lote/', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          
          setMensajeLote({ 
              texto: res.data.mensaje, 
              tipo: 'success',
              errores: res.data.errores 
          });
          setArchivoCSV(null); // Limpiar el input
      } catch (error) {
          setMensajeLote({ texto: error.response?.data?.detail || 'Error al procesar el lote.', tipo: 'error' });
      }
    };

    const seleccionarPieza = (pieza) => {
        setPiezaInfo(pieza);
        setPiezasEncontradas([]);
        setBusquedaNumeroPieza(pieza.numero_pieza.toString());
        
        if (pieza.peso_salida_camara_kg) {
            const totalCamara = pieza.peso_salida_camara_kg;
            setPesoCamara(totalCamara);
            
            if (pieza.en_stock_pierna && !pieza.en_stock_espalda) {
                setCorteSeleccionado('Pierna');
                setPesoCorteEspecifico((totalCamara - pieza.peso_salida_espalda_kg).toFixed(2));
                setTimeout(() => btnConfirmarRef.current?.focus(), 100);
            } else if (pieza.en_stock_espalda && !pieza.en_stock_pierna) {
                setCorteSeleccionado('Espalda');
                setPesoCorteEspecifico((totalCamara - pieza.peso_salida_pierna_kg).toFixed(2));
                setTimeout(() => btnConfirmarRef.current?.focus(), 100);
            } else {
                // Si están los dos disponibles, focuseamos el primer botón de corte (Completa o Pierna)
                setTimeout(() => {
                    if (btnCompletaRef.current) btnCompletaRef.current.focus();
                    else if (btnPiernaRef.current) btnPiernaRef.current.focus();
                }, 100);
            }
        } else {
            setPesoCamara('');
            setTimeout(() => inputPesoCamaraRef.current?.focus(), 100); 
        }
    };

    // --- EVENTOS DE TECLADO: PESO DE CÁMARA ---
    const handleKeyDownPesoCamara = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            // Salta al primer botón de corte disponible (Media Completa es el primero)
            if (btnCompletaRef.current) btnCompletaRef.current.focus();
            else if (btnPiernaRef.current) btnPiernaRef.current.focus();
            else if (btnEspaldaRef.current) btnEspaldaRef.current.focus();
        }
    };

    // --- NUEVO: EVENTOS DE TECLADO CON FLECHAS PARA LOS 3 BOTONES DE CORTES ---
    const handleKeyDownCortes = (e, corteActual) => {
        if (!piezaInfo) return;

        // Armamos la lista de botones *disponibles* en stock para esta pieza
        let refsDisponibles = [];
        if (piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda) refsDisponibles.push({ref: btnCompletaRef, nombre: 'Completa'});
        if (piezaInfo.en_stock_pierna) refsDisponibles.push({ref: btnPiernaRef, nombre: 'Pierna'});
        if (piezaInfo.en_stock_espalda) refsDisponibles.push({ref: btnEspaldaRef, nombre: 'Espalda'});

        const indiceActual = refsDisponibles.findIndex(r => r.nombre === corteActual);
        let indiceSiguiente;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            // Mueve a la derecha (o vuelve al principio si está al final)
            indiceSiguiente = (indiceActual + 1) % refsDisponibles.length;
            refsDisponibles[indiceSiguiente].ref.current?.focus();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            // Mueve a la izquierda (o va al final si está al principio)
            indiceSiguiente = (indiceActual - 1 + refsDisponibles.length) % refsDisponibles.length;
            refsDisponibles[indiceSiguiente].ref.current?.focus();
        } else if (e.key === 'Enter') {
            // Si apreta Enter sobre un botón focado, ejecuta su acción (selecciona y salta)
            e.preventDefault();
            refsDisponibles[indiceActual].ref.current?.click();
        }
    };

    const ejecutarDespacho = async () => {
        if (!clienteSeleccionado) {
            setMensaje({ texto: 'Falta seleccionar el Cliente.', tipo: 'error' });
            return;
        }
        if (!piezaInfo) {
            setMensaje({ texto: 'Seleccioná una pieza válida.', tipo: 'error' });
            return;
        }
        if (!pesoCamara || isNaN(parseFloat(pesoCamara))) {
            setMensaje({ texto: 'Ingresá el Peso de Salida de Cámara.', tipo: 'error' });
            inputPesoCamaraRef.current?.focus();
            return;
        }
        if (!corteSeleccionado) {
            setMensaje({ texto: 'Seleccioná si sale Completa, Pierna o Espalda.', tipo: 'error' });
            return;
        }
        if ((corteSeleccionado === 'Pierna' || corteSeleccionado === 'Espalda') && (!pesoCorteEspecifico || isNaN(parseFloat(pesoCorteEspecifico)))) {
            setMensaje({ texto: `Ingresá los kilos de la ${corteSeleccionado}.`, tipo: 'error' });
            inputPesoCorteRef.current?.focus();
            return;
        }

        try {
            await api.post('/piezas/salida-rafaga/', {
                tropa_id: piezaInfo.tropa_id,
                numero_pieza: piezaInfo.numero_pieza,
                destino: clienteSeleccionado,
                modo: corteSeleccionado === 'Completa' ? 'Media Completa' : 'Fraccionada',
                peso_salida_camara_kg: parseFloat(pesoCamara),
                corte_a_salir: corteSeleccionado === 'Completa' ? 'Ambos' : corteSeleccionado,
                peso_corte_especifico: corteSeleccionado === 'Completa' ? null : parseFloat(pesoCorteEspecifico)
            });

            setMensaje({ texto: `✅ ¡Pieza Nº ${piezaInfo.numero_pieza} despachada a ${clienteSeleccionado}!`, tipo: 'success' });
            
            setBusquedaNumeroPieza('');
            setPiezaInfo(null);
            setPesoCamara('');
            setPesoCorteEspecifico('');
            setCorteSeleccionado('');
            
            // Volvemos el foco al buscador de piezas para seguir sacando
            inputBusquedaPiezaRef.current?.focus();

        } catch (error) {
            setMensaje({ texto: error.response?.data?.detail || 'Error en el despacho.', tipo: 'error' });
        }
    };

    return (
        <div className="page-container">
            <section className="card card-elevated content-block">
                <h2>⚡ Despacho Rápido</h2>

                <div className="inline-row" style={{ gap: '15px', marginBottom: '20px' }}>
                    
                    {/* BUSCADOR DE CLIENTE */}
                    <div className="field-block" style={{ flex: 1, position: 'relative', margin: 0 }}>
                        <label><strong>1. Cliente Destino:</strong></label>
                        <input 
                            type="text" placeholder="Buscar/Crear cliente..." 
                            value={busquedaCliente} 
                            onChange={(e) => { setBusquedaCliente(e.target.value); setClienteSeleccionado(''); }}
                            onKeyDown={handleKeyDownCliente} // Escucha el Enter
                            style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box' }}
                        />
                        {busquedaCliente && !clienteSeleccionado && (
                            <div style={{ position: 'absolute', zIndex: 10, width: '100%', backgroundColor: '#1e293b', border: '1px solid #475569', maxHeight: '200px', overflowY: 'auto' }}>
                                {clientesFiltrados.map(c => (
                                    <div 
                                        key={c.id} 
                                        tabIndex={0} // Permite navegar con TAB
                                        onKeyDown={(e) => { if(e.key === 'Enter') { setClienteSeleccionado(c.nombre); setBusquedaCliente(c.nombre); inputBusquedaPiezaRef.current?.focus(); } }}
                                        onClick={() => { setClienteSeleccionado(c.nombre); setBusquedaCliente(c.nombre); inputBusquedaPiezaRef.current?.focus(); }} 
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #334155', outline: 'none' }}
                                        onFocus={(e) => e.target.style.backgroundColor = '#334155'}
                                        onBlur={(e) => e.target.style.backgroundColor = 'transparent'}
                                    >
                                        🛒 {c.nombre}
                                    </div>
                                ))}
                                {clientesFiltrados.length === 0 && (
                                    <div style={{ padding: '10px' }}>
                                        <button 
                                            tabIndex={0}
                                            onClick={async () => { const res = await api.post('/clientes/', { nombre: busquedaCliente }); setClientes([...clientes, res.data]); setClienteSeleccionado(res.data.nombre); setBusquedaCliente(res.data.nombre); inputBusquedaPiezaRef.current?.focus(); }} 
                                            className="btn-sm btn-primary"
                                        >
                                            ➕ Agregar "{busquedaCliente}"
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {clienteSeleccionado && <div style={{ color: '#22c55e', fontWeight: 'bold', marginTop: '5px' }}>Destino fijado: {clienteSeleccionado}</div>}
                    </div>

                    {/* BUSCADOR INVERTIDO DE PIEZA */}
                    <div className="field-block" style={{ flex: 1, position: 'relative', margin: 0 }}>
                        <label><strong>2. Buscar Nº de Pieza:</strong></label>
                        <input 
                            type="number" 
                            ref={inputBusquedaPiezaRef} 
                            value={busquedaNumeroPieza} 
                            onChange={handleBusquedaPiezaChange}
                            onKeyDown={handleKeyDownBusquedaPieza} // Escucha el Enter
                            placeholder="Tipeá el número..."
                            style={{ width: '100%', padding: '10px', marginTop: '5px', boxSizing: 'border-box', fontSize: '18px', fontWeight: 'bold' }}
                        />
                        {piezasEncontradas.length > 0 && !piezaInfo && (
                            <div style={{ position: 'absolute', zIndex: 10, width: '100%', backgroundColor: '#1e293b', border: '1px solid #475569', boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }}>
                                {piezasEncontradas.map(p => (
                                    <div 
                                        key={p.id} 
                                        tabIndex={0} // Permite navegar con TAB
                                        onKeyDown={(e) => { if(e.key === 'Enter') seleccionarPieza(p); }}
                                        onClick={() => seleccionarPieza(p)} 
                                        style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', outline: 'none' }}
                                        onFocus={(e) => e.target.style.backgroundColor = '#334155'}
                                        onBlur={(e) => e.target.style.backgroundColor = 'transparent'}
                                    >
                                        <span><strong>Tropa: {p.numero_tropa}</strong> ({p.matadero})</span>
                                        <span style={{ color: '#94a3b8' }}>{p.peso_entrada_kg} kg</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* PANEL DE DESPACHO */}
                {piezaInfo && (
                    <div className="section-soft" style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #475569' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '10px', marginBottom: '15px' }}>
                            <span style={{ fontSize: '18px', color: '#cbd5e1' }}>Pieza Nº <strong>{piezaInfo.numero_pieza}</strong></span>
                            <span style={{ fontSize: '18px', color: '#cbd5e1' }}>Entrada: <strong>{piezaInfo.peso_entrada_kg} kg</strong></span>
                        </div>

                        <div className="field-block" style={{ marginBottom: '20px' }}>
                            <label style={{ color: '#f8fafc', fontSize: '15px' }}>
                                <strong>3. Peso Salida de Cámara (Kg):</strong> 
                                {piezaInfo.peso_salida_camara_kg && <span style={{ color: '#fbbf24', marginLeft: '10px' }}>(Fijado en venta anterior)</span>}
                            </label>
                            <input 
                                type="number" step="0.01" 
                                value={pesoCamara}
                                onChange={(e) => setPesoCamara(e.target.value)}
                                disabled={!!piezaInfo.peso_salida_camara_kg}
                                ref={inputPesoCamaraRef}
                                onKeyDown={handleKeyDownPesoCamara} // Escucha el Enter para saltar a botones
                                placeholder="Tipear peso que marca la balanza..."
                                style={{ width: '100%', padding: '12px', fontSize: '20px', textAlign: 'center', fontWeight: 'bold', marginTop: '5px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ color: '#f8fafc', fontSize: '15px', display: 'block', marginBottom: '10px' }}><strong>4. ¿Qué vas a despachar?</strong></label>
                            
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                {piezaInfo.en_stock_pierna && piezaInfo.en_stock_espalda && (
                                    <button 
                                        ref={btnCompletaRef} 
                                        tabIndex={0}
                                        className="btn-navegable-teclado" // Aplica el estilo global al foco
                                        onKeyDown={(e) => handleKeyDownCortes(e, 'Completa')} // Habilita las flechas
                                        onClick={() => { setCorteSeleccionado('Completa'); setTimeout(() => btnConfirmarRef.current?.focus(), 50); }}
                                        style={{ flex: 1, padding: '15px', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Completa' ? '3px solid #22c55e' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Completa' ? '#166534' : '#334155', color: 'white', outline: 'none' }}
                                    >
                                        🥩 MEDIA COMPLETA
                                    </button>
                                )}

                                {piezaInfo.en_stock_pierna && (
                                    <button 
                                        ref={btnPiernaRef} 
                                        tabIndex={0}
                                        className="btn-navegable-teclado" // Aplica el estilo global al foco
                                        onKeyDown={(e) => handleKeyDownCortes(e, 'Pierna')} // Habilita las flechas
                                        onClick={() => { setCorteSeleccionado('Pierna'); setTimeout(() => inputPesoCorteRef.current?.focus(), 50); }}
                                        style={{ flex: 1, padding: '15px', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Pierna' ? '3px solid #3b82f6' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Pierna' ? '#1e3a8a' : '#334155', color: 'white', outline: 'none' }}
                                    >
                                        🍗 PIERNA
                                    </button>
                                )}

                                {piezaInfo.en_stock_espalda && (
                                    <button 
                                        ref={btnEspaldaRef} 
                                        tabIndex={0}
                                        className="btn-navegable-teclado" // Aplica el estilo global al foco
                                        onKeyDown={(e) => handleKeyDownCortes(e, 'Espalda')} // Habilita las flechas
                                        onClick={() => { setCorteSeleccionado('Espalda'); setTimeout(() => inputPesoCorteRef.current?.focus(), 50); }}
                                        style={{ flex: 1, padding: '15px', fontWeight: 'bold', borderRadius: '6px', cursor: 'pointer', border: corteSeleccionado === 'Espalda' ? '3px solid #eab308' : '1px solid #475569', backgroundColor: corteSeleccionado === 'Espalda' ? '#854d0e' : '#334155', color: 'white', outline: 'none' }}
                                    >
                                        🍖 ESPALDA
                                    </button>
                                )}
                            </div>
                        </div>

                        {(corteSeleccionado === 'Pierna' || corteSeleccionado === 'Espalda') && (
                            <div className="field-block" style={{ backgroundColor: '#0f172a', padding: '15px', borderRadius: '6px', border: '1px solid #3b82f6' }}>
                                <label style={{ color: '#93c5fd' }}><strong>Kilos de la {corteSeleccionado}:</strong></label>
                                <input 
                                    type="number" step="0.01" 
                                    value={pesoCorteEspecifico} 
                                    onChange={(e) => setPesoCorteEspecifico(e.target.value)}
                                    onKeyDown={(e) => { if(e.key === 'Enter') btnConfirmarRef.current?.focus(); }} // Enter te lleva al botón verde
                                    ref={inputPesoCorteRef} 
                                    placeholder="Peso del corte separado..."
                                    style={{ width: '100%', padding: '12px', fontSize: '18px', textAlign: 'center', fontWeight: 'bold', marginTop: '5px', boxSizing: 'border-box' }} 
                                />
                                {piezaInfo.peso_salida_camara_kg && <small style={{ color: '#22c55e', display: 'block', marginTop: '5px', textAlign: 'center' }}>Calculado automáticamente por diferencia.</small>}
                            </div>
                        )}

                        <button 
                            ref={btnConfirmarRef} 
                            onClick={ejecutarDespacho} 
                            tabIndex={0}
                            className="btn-lg btn-success btn-navegable-teclado" // Botón verde también con foco brillante
                            style={{ width: '100%', marginTop: '10px', padding: '15px', fontSize: '18px' }}
                        >
                            🚀 CONFIRMAR DESPACHO
                        </button>
                    </div>
                )}

                {mensaje.texto && (
                    <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '20px' }}>
                        {mensaje.texto}
                    </div>
                )}
            </section>
            <div className="section-soft" style={{ marginTop: '30px', padding: '20px', backgroundColor: '#0f172a', border: '1px solid #3b82f6', borderRadius: '8px' }}>
              <h3 style={{ color: '#93c5fd', marginTop: 0 }}>📂 Carga Masiva desde Archivo (Excel/CSV)</h3>
              <p style={{ color: '#cbd5e1', fontSize: '14px', marginBottom: '15px' }}>
                  El archivo debe ser formato <strong>.csv</strong> y contener las siguientes columnas (exactamente así en la primer fila):<br/>
                  <code style={{ backgroundColor: '#1e293b', padding: '4px', borderRadius: '4px', color: '#f8fafc' }}>tropa, pieza, cliente, peso_camara, corte, peso_corte</code>
              </p>
                        
              <div className="inline-row" style={{ gap: '15px', alignItems: 'center' }}>
                  <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => setArchivoCSV(e.target.files[0])}
                      style={{ color: '#f8fafc' }}
                  />
                  <button 
                      onClick={handleSubirLote} 
                      className="btn-lg btn-primary"
                      style={{ padding: '10px 20px' }}
                  >
                      Subir y Procesar Lote
                  </button>
              </div>
                        
              {mensajeLote && (
                  <div style={{ marginTop: '15px', padding: '15px', borderRadius: '6px', backgroundColor: mensajeLote.tipo === 'error' ? '#7f1d1d' : '#14532d', color: 'white' }}>
                      <strong>{mensajeLote.texto}</strong>
                      {mensajeLote.errores && mensajeLote.errores.length > 0 && (
                          <ul style={{ marginTop: '10px', paddingLeft: '20px', color: '#fca5a5' }}>
                              {mensajeLote.errores.map((err, idx) => (
                                  <li key={idx}>{err}</li>
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