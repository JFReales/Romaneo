import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const CargarPiezas = ({ onCargaExitosa }) => {
    // --- ESTADOS DE TROPA ---
    const [tropas, setTropas] = useState([]);
    const [busquedaTropa, setBusquedaTropa] = useState('');
    const [tropaSeleccionada, setTropaSeleccionada] = useState(() => {
        return localStorage.getItem('carga_tropaSeleccionada') || '';
    });
    const [piezasTropa, setPiezasTropa] = useState([]);

    // --- ESTADOS DE CONTROL DE TROPA ---
    const [cantidadTotalPiezas, setCantidadTotalPiezas] = useState('');
    const [kilosTotales, setKilosTotales] = useState('');

    // --- ESTADOS DEL FORMULARIO ---
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
                
                const idGuardado = localStorage.getItem('carga_tropaSeleccionada');
                if (idGuardado) {
                    const tropaEncontrada = response.data.find(t => t.id.toString() === idGuardado);
                    if (tropaEncontrada) {
                        setBusquedaTropa(tropaEncontrada.numero_tropa);
                    }
                }
            } catch (error) {
                console.error("Error al cargar tropas", error);
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
            console.error("Error al cargar las piezas de la tropa", error);
        }
    };

    useEffect(() => {
        localStorage.setItem('carga_tropaSeleccionada', tropaSeleccionada);
        cargarPiezasDeTropa(tropaSeleccionada);
        cancelarEdicion(); 
        
        if (tropaSeleccionada) {
            const controlGuardado = localStorage.getItem(`control_tropa_${tropaSeleccionada}`);
            if (controlGuardado) {
                const parsed = JSON.parse(controlGuardado);
                setCantidadTotalPiezas(parsed.cantidad);
                setKilosTotales(parsed.kilos);
            } else {
                setCantidadTotalPiezas('');
                setKilosTotales('');
            }
        }
    }, [tropaSeleccionada]);

    const handleControlChange = (tipo, valor) => {
        let nuevosDatos = { cantidad: cantidadTotalPiezas, kilos: kilosTotales };
        if (tipo === 'cantidad') {
            setCantidadTotalPiezas(valor);
            nuevosDatos.cantidad = valor;
        } else {
            setKilosTotales(valor);
            nuevosDatos.kilos = valor;
        }
        localStorage.setItem(`control_tropa_${tropaSeleccionada}`, JSON.stringify(nuevosDatos));
    };

    const tropasFiltradas = tropas.filter(t => 
        t.numero_tropa.toLowerCase().includes(busquedaTropa.toLowerCase())
    );

    const handleKeyDownBuscadorTropa = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const coincidenciaExacta = tropas.find(
                t => t.numero_tropa.trim().toLowerCase() === busquedaTropa.trim().toLowerCase()
            );

            if (coincidenciaExacta) {
                setTropaSeleccionada(coincidenciaExacta.id.toString());
                setBusquedaTropa(coincidenciaExacta.numero_tropa);
                setMensaje({ texto: '', tipo: '' });
                setTimeout(() => inputNumeroRef.current?.focus(), 100);
            } else if (tropasFiltradas.length === 1) {
                setTropaSeleccionada(tropasFiltradas[0].id.toString());
                setBusquedaTropa(tropasFiltradas[0].numero_tropa);
                setMensaje({ texto: '', tipo: '' });
                setTimeout(() => inputNumeroRef.current?.focus(), 100);
            } else {
                setMensaje({ texto: 'No se encontró coincidencia exacta para seleccionar.', tipo: 'error' });
            }
        }
    };

    const activarEdicion = (pieza) => {
        setIdEditando(pieza.id);
        setNumeroPieza(pieza.numero_pieza);
        setPesoEntrada(pieza.peso_entrada_kg);
        setMensaje({ texto: `Corrigiendo pieza Nº ${pieza.numero_pieza}.`, tipo: 'success' });
        inputNumeroRef.current?.focus();
    };

    const cancelarEdicion = () => {
        setIdEditando(null);
        setNumeroPieza('');
        setPesoEntrada('');
        setMensaje({ texto: '', tipo: '' });
    };

    // --- NUEVA LÓGICA: ELIMINAR PIEZA ---
    const eliminarPieza = async (pieza) => {
        // Pedimos confirmación nativa del navegador para no borrar por accidente
        if (!window.confirm(`¿Estás seguro de que querés ELIMINAR la pieza Nº ${pieza.numero_pieza} (Entrada: ${pieza.peso_entrada_kg} kg)?`)) {
            return;
        }

        try {
            await api.delete(`/piezas/${pieza.id}`);
            setMensaje({ texto: `🗑️ Pieza Nº ${pieza.numero_pieza} eliminada correctamente.`, tipo: 'success' });
            cargarPiezasDeTropa(tropaSeleccionada);
            
            // Si estábamos editando esa misma pieza, cancelamos la edición
            if (idEditando === pieza.id) {
                cancelarEdicion();
            }
        } catch (error) {
            const errorMsg = error.response?.data?.detail || 'Error al eliminar la pieza';
            setMensaje({ texto: errorMsg, tipo: 'error' });
        }
    };

    const handleCargarPieza = async () => {
        if (!tropaSeleccionada) {
            setMensaje({ texto: 'Primero seleccioná una tropa del buscador.', tipo: 'error' });
            return;
        }
        if (!numeroPieza || !pesoEntrada) {
            setMensaje({ texto: 'Completá número y peso de entrada.', tipo: 'error' });
            return;
        }

        try {
            if (idEditando) {
                await api.put(`/piezas/${idEditando}`, {
                    numero_pieza: parseInt(numeroPieza),
                    peso_entrada_kg: parseFloat(pesoEntrada)
                });
                setMensaje({ texto: `✅ Pieza ${numeroPieza} actualizada correctamente.`, tipo: 'success' });
                setIdEditando(null);
                setNumeroPieza('');
                setPesoEntrada('');
                inputNumeroRef.current?.focus();
            } else {
                await api.post(`/tropas/${tropaSeleccionada}/piezas/`, {
                    numero_pieza: parseInt(numeroPieza),
                    peso_entrada_kg: parseFloat(pesoEntrada)
                });
                setMensaje({ texto: `⚡ Pieza ${numeroPieza} ingresada con ${pesoEntrada} Kg.`, tipo: 'success' });
                if (onCargaExitosa) onCargaExitosa();
                
                const numSiguiente = parseInt(numeroPieza) + 1;
                setNumeroPieza(numSiguiente.toString());
                setPesoEntrada('');
                setTimeout(() => inputPesoRef.current?.focus(), 50);
            }
            
            cargarPiezasDeTropa(tropaSeleccionada);

        } catch (error) {
            const errorMsg = error.response?.data?.detail || 'Error al procesar la pieza';
            setMensaje({ texto: errorMsg, tipo: 'error' });
            inputNumeroRef.current.focus();
        }
    };

    const handleKeyDownNumero = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (numeroPieza) inputPesoRef.current.focus();
        }
    };

    const handleKeyDownPeso = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleCargarPieza();
        }
    };

    const tropaActual = tropas.find(t => t.id.toString() === tropaSeleccionada);
    const busquedaCoincide = tropaActual && tropaActual.numero_tropa === busquedaTropa;

    const kilosCargadosActuales = piezasTropa.reduce((acc, p) => acc + parseFloat(p.peso_entrada_kg), 0);
    const piezasCargadasActuales = piezasTropa.length;
    
    let advertenciaControl = null;
    if (cantidadTotalPiezas && kilosTotales && piezasCargadasActuales >= parseInt(cantidadTotalPiezas)) {
        const diferencia = Math.abs(parseFloat(kilosTotales) - kilosCargadosActuales);
        if (diferencia > 0.5) { 
            advertenciaControl = `¡ATENCIÓN! Se cargaron las ${piezasCargadasActuales} piezas, pero los kilos sumados (${kilosCargadosActuales.toFixed(2)} kg) NO coinciden con los declarados (${kilosTotales} kg). Diferencia: ${diferencia.toFixed(2)} kg.`;
        } else {
            advertenciaControl = `✅ ¡Carga Perfecta! Las ${piezasCargadasActuales} piezas coinciden exacto con los ${kilosTotales} kg.`;
        }
    }

    return (
        <div className="page-container">
            <section className="card card-elevated content-block">
                <h2>Carga Rápida de Piezas</h2>

                <div className="field-block" style={{ position: 'relative' }}>
                    <label htmlFor="tropa-carga">1. Buscar Tropa (Por número)</label>
                    <input
                        id="tropa-carga"
                        type="text"
                        placeholder="Tipeá el número de tropa y dale Enter..."
                        value={busquedaTropa}
                        onChange={(e) => {
                            setBusquedaTropa(e.target.value);
                            setTropaSeleccionada('');
                        }}
                        onKeyDown={handleKeyDownBuscadorTropa} 
                        style={{ width: '100%', padding: '10px', fontSize: '16px', boxSizing: 'border-box' }}
                    />
                    
                    {busquedaTropa && !busquedaCoincide && (
                        <div style={{ 
                            position: 'absolute', width: '100%', zIndex: 10, 
                            backgroundColor: '#1e293b', border: '1px solid #475569', 
                            maxHeight: '200px', overflowY: 'auto', marginTop: '4px', borderRadius: '4px' 
                        }}>
                            {tropasFiltradas.length > 0 ? (
                                tropasFiltradas.map(t => (
                                    <div 
                                        key={t.id} 
                                        onClick={() => {
                                            setTropaSeleccionada(t.id.toString());
                                            setBusquedaTropa(t.numero_tropa);
                                        }}
                                        style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid #334155', color: '#f8fafc' }}
                                    >
                                        🔍 {t.numero_tropa} - {t.matadero}
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '10px', color: '#ef4444' }}>No se encontró ninguna tropa.</div>
                            )}
                        </div>
                    )}

                    {busquedaCoincide && (
                        <div style={{ color: '#22c55e', fontWeight: 'bold', marginTop: '8px', fontSize: '14px' }}>
                            ✅ Tropa Seleccionada: {tropaActual.numero_tropa} ({tropaActual.matadero})
                        </div>
                    )}
                </div>

                {tropaSeleccionada && (
                    <>
                        <div className="section-soft" style={{ marginBottom: '15px', padding: '15px', backgroundColor: '#e2e8f0' }}>
                            <strong style={{ color: '#0f172a' }}>Datos de Control (Boleta/Remito)</strong>
                            <div className="inline-row" style={{ gap: '15px', marginTop: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', color: '#475569' }}>Total Piezas Esperadas:</label>
                                    <input
                                        type="number"
                                        value={cantidadTotalPiezas}
                                        onChange={(e) => handleControlChange('cantidad', e.target.value)}
                                        placeholder="Ej: 70"
                                        style={{ width: '100%', padding: '8px', fontSize: '16px', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '12px', color: '#475569' }}>Kilos Totales Esperados:</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={kilosTotales}
                                        onChange={(e) => handleControlChange('kilos', e.target.value)}
                                        placeholder="Ej: 8000.50"
                                        style={{ width: '100%', padding: '8px', fontSize: '16px', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            
                            {(cantidadTotalPiezas || kilosTotales) && (
                                <div style={{ marginTop: '10px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', color: '#334155', fontWeight: 'bold' }}>
                                    <span>Progreso Piezas: {piezasCargadasActuales} / {cantidadTotalPiezas || '?'}</span>
                                    <span>Suma Kilos: {kilosCargadosActuales.toFixed(2)} / {kilosTotales || '?'}</span>
                                </div>
                            )}
                        </div>

                        {advertenciaControl && (
                            <div className={`alert ${advertenciaControl.includes('ATENCIÓN') ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: '15px' }}>
                                {advertenciaControl}
                            </div>
                        )}

                        <div
                            className="section-soft"
                            style={{
                                marginBottom: '15px',
                                padding: '15px',
                                backgroundColor: idEditando ? '#fff8e7' : undefined,
                            }}
                        >
                            <strong style={{ display: 'block', marginBottom: '10px', color: idEditando ? '#92400e' : '#0f172a' }}>
                                {idEditando ? 'Modo Edición Activo' : '2. Datos de la Media (teclado rápido)'}
                            </strong>

                            <div className="inline-row" style={{ gap: '15px' }}>
                                <div style={{ flex: 1, minWidth: '170px' }}>
                                    <label htmlFor="numero-pieza" style={{ fontSize: '13px' }}>Número de pieza</label>
                                    <input
                                        id="numero-pieza"
                                        type="number"
                                        value={numeroPieza}
                                        onChange={(e) => setNumeroPieza(e.target.value)}
                                        onKeyDown={handleKeyDownNumero}
                                        ref={inputNumeroRef}
                                        placeholder="Ej: 15"
                                        style={{ textAlign: 'center', fontSize: '20px', fontWeight: '700', width: '100%', boxSizing: 'border-box' }}
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
                                        style={{ textAlign: 'center', fontSize: '20px', fontWeight: '700', width: '100%', boxSizing: 'border-box' }}
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
                    </>
                )}

                {mensaje.texto && (
                    <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`}>
                        {mensaje.texto}
                    </div>
                )}
            </section>

            {tropaSeleccionada && (
                <section className="card content-block">
                    <h3>Piezas de esta Tropa ({piezasCargadasActuales} cargadas)</h3>

                    {piezasTropa.length === 0 ? (
                        <p style={{ color: '#64748b', fontStyle: 'italic' }}>Aún no hay piezas cargadas en esta tropa.</p>
                    ) : (
                        <div style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '8px' }}>
                            <table className="table-modern" style={{ textAlign: 'center', width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th># Pieza</th>
                                        <th>Peso Entrada</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {piezasTropa.map((p) => (
                                        <tr key={p.id}>
                                            <td style={{ fontWeight: '700', fontSize: '18px' }}>{p.numero_pieza}</td>
                                            <td style={{ color: '#475569' }}>{p.peso_entrada_kg} kg</td>
                                            
                                            {/* --- BOTONES DE ACCIÓN (EDITAR Y BORRAR) --- */}
                                            <td>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                    <button onClick={() => activarEdicion(p)} className="btn-sm btn-primary">
                                                        Editar
                                                    </button>
                                                    <button 
                                                        onClick={() => eliminarPieza(p)} 
                                                        className="btn-sm" 
                                                        style={{ backgroundColor: '#ef4444', color: 'white', border: 'none' }}
                                                    >
                                                        Borrar
                                                    </button>
                                                </div>
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