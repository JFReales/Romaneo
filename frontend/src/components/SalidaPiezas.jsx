import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';


const TIPOS = [
  { value: 'Media', label: 'Media completa' },
  { value: 'Pierna', label: 'Pierna' },
  { value: 'Espalda', label: 'Espalda' },
  { value: 'Rueda', label: 'Rueda' },
  { value: 'Completo', label: 'Completo' },
  { value: 'Vacio', label: 'Vacío' },
];

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaInput = (iso) => (iso ? iso.slice(0, 10) : hoy());


const Combobox = ({ label, value, onChange, options, placeholder }) => {
  const [abierto, setAbierto] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const filtrados = useMemo(() => {
    if (verTodos || !value.trim()) return options.slice(0, 100);
    const texto = value.toLowerCase();
    return options.filter((item) => item.toLowerCase().includes(texto)).slice(0, 100);
  }, [options, value, verTodos]);

  return (
    <div className="field-block" style={{ position: 'relative', marginBottom: 0 }}>
      <label>{label}</label>
      <div className="combo-control">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setVerTodos(false);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => setTimeout(() => setAbierto(false), 120)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="combo-arrow"
          title="Ver todos"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setVerTodos(true);
            setAbierto(true);
          }}
        >
          ▼
        </button>
      </div>

      {abierto && (
        <div className="combo-menu">
          {filtrados.length === 0 ? (
            <div className="combo-empty">Podés usar este nombre nuevo.</div>
          ) : filtrados.map((item) => (
            <button
              type="button"
              key={item}
              className="combo-option"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item);
                setAbierto(false);
                setVerTodos(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


const SalidaPiezas = () => {
  const [clientes, setClientes] = useState([]);
  const [firmas, setFirmas] = useState([]);
  const [tropas, setTropas] = useState([]);
  const [tropaSeleccionadaId, setTropaSeleccionadaId] = useState('');
  const [piezasTropa, setPiezasTropa] = useState([]);
  const [cargandoPiezas, setCargandoPiezas] = useState(false);
  const [numeroBusqueda, setNumeroBusqueda] = useState('');
  const [resultados, setResultados] = useState([]);
  const [pieza, setPieza] = useState(null);

  const [tipo, setTipo] = useState('');
  const [pesoCamara, setPesoCamara] = useState('');
  const [pesoSalida, setPesoSalida] = useState('');
  const [cliente, setCliente] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [fechaSalida, setFechaSalida] = useState(hoy());
  const [cerrarPieza, setCerrarPieza] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [salidaEditando, setSalidaEditando] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [advertencia, setAdvertencia] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [archivoCSV, setArchivoCSV] = useState(null);
  const [mensajeLote, setMensajeLote] = useState(null);
  const inputPiezaRef = useRef(null);
  const cargaTropaRef = useRef(0);

  const nombresClientes = useMemo(() => clientes.map((item) => item.nombre), [clientes]);
  const nombresFirmas = useMemo(() => firmas.map((item) => item.nombre), [firmas]);
  const tropaSeleccionada = useMemo(
    () => tropas.find((item) => String(item.id) === tropaSeleccionadaId),
    [tropas, tropaSeleccionadaId],
  );
  const esPrestamo = pieza && razonSocial.trim()
    && pieza.firma.trim().toLowerCase() !== razonSocial.trim().toLowerCase();

  const cargarCatalogos = async () => {
    try {
      const [resClientes, resFirmas, resTropas] = await Promise.all([
        api.get('/clientes/'),
        api.get('/firmas/'),
        api.get('/tropas/'),
      ]);
      setClientes(resClientes.data);
      setFirmas(resFirmas.data);
      setTropas(resTropas.data);
    } catch {
      setMensaje({ texto: 'No se pudieron cargar tropas, clientes o razones sociales.', tipo: 'error' });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarCatalogos();
  }, []);

  const limpiarFormulario = (piezaActual = pieza) => {
    setTipo('');
    setPesoSalida('');
    setFechaSalida(hoy());
    setCerrarPieza(false);
    setObservaciones('');
    setSalidaEditando(null);
    setAdvertencia('');
    if (piezaActual) {
      setPesoCamara(piezaActual.peso_salida_camara_kg || '');
      setRazonSocial(piezaActual.firma || '');
    } else {
      setPesoCamara('');
      setRazonSocial('');
    }
  };

  const seleccionarTropa = async (tropaId) => {
    const solicitudId = ++cargaTropaRef.current;
    setTropaSeleccionadaId(tropaId);
    setPiezasTropa([]);
    setNumeroBusqueda('');
    setResultados([]);
    setPieza(null);
    setCliente('');
    limpiarFormulario(null);
    setMensaje({ texto: '', tipo: '' });

    if (!tropaId) {
      setCargandoPiezas(false);
      return;
    }

    setCargandoPiezas(true);
    try {
      const res = await api.get(`/tropas/${tropaId}/piezas/`);
      if (solicitudId !== cargaTropaRef.current) return;
      setPiezasTropa(res.data);
      if (res.data.length === 0) {
        setMensaje({ texto: 'La tropa seleccionada todavía no tiene piezas cargadas.', tipo: 'error' });
      } else {
        setTimeout(() => inputPiezaRef.current?.focus(), 50);
      }
    } catch (error) {
      if (solicitudId !== cargaTropaRef.current) return;
      setMensaje({ texto: error.response?.data?.detail || 'No se pudieron cargar las piezas de la tropa.', tipo: 'error' });
    } finally {
      if (solicitudId === cargaTropaRef.current) setCargandoPiezas(false);
    }
  };

  const buscarPiezas = (valor) => {
    setNumeroBusqueda(valor);
    setPieza(null);
    setMensaje({ texto: '', tipo: '' });
    if (!tropaSeleccionadaId || !valor.trim()) {
      setResultados([]);
      return;
    }

    const coincidencias = piezasTropa
      .filter((item) => String(item.numero_pieza).includes(valor.trim()))
      .slice(0, 100);
    setResultados(coincidencias);
  };

  const seleccionarPieza = async (seleccionada) => {
    if (!tropaSeleccionadaId) return;
    try {
      const res = await api.get(
        `/tropas/${tropaSeleccionadaId}/piezas/${seleccionada.numero_pieza}/status`,
      );
      setPieza(res.data);
      setNumeroBusqueda(String(res.data.numero_pieza));
      setResultados([]);
      setMensaje({ texto: '', tipo: '' });
      setCliente('');
      limpiarFormulario(res.data);
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo cargar la pieza seleccionada.', tipo: 'error' });
    }
  };

  const recargarPieza = async (
    tropaId = pieza?.tropa_id,
    numero = pieza?.numero_pieza,
  ) => {
    if (!tropaId || numero === undefined) return;
    const res = await api.get(`/tropas/${tropaId}/piezas/${numero}/status`);
    setPieza(res.data);
    setPesoCamara(res.data.peso_salida_camara_kg || '');
  };

  const elegirTipo = (valor) => {
    setTipo(valor);
    if (valor === 'Media') {
      const peso = pieza?.peso_salida_camara_kg || pesoCamara || pieza?.peso_entrada_kg || '';
      setPesoSalida(peso);
      setCerrarPieza(true);
    } else {
      setCerrarPieza(false);
      setPesoSalida('');
    }
  };

  const editarSalida = (salida) => {
    setSalidaEditando(salida.id);
    setTipo(salida.tipo);
    setPesoSalida(String(salida.peso_kg));
    setCliente(salida.cliente);
    setRazonSocial(salida.razon_social_destino);
    setFechaSalida(fechaInput(salida.fecha_salida));
    setCerrarPieza(Boolean(salida.cierra_pieza));
    setObservaciones(salida.observaciones || '');
    setAdvertencia('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const guardarSalida = async () => {
    if (!pieza || !tipo || !pesoSalida || !cliente.trim() || !razonSocial.trim()) {
      setMensaje({ texto: 'Completá tipo, peso, cliente y razón social destino.', tipo: 'error' });
      return;
    }
    if (!salidaEditando && !pieza.peso_salida_camara_kg && !pesoCamara) {
      setMensaje({ texto: 'La primera salida necesita el peso de cámara.', tipo: 'error' });
      return;
    }

    setGuardando(true);
    setMensaje({ texto: '', tipo: '' });
    try {
      let res;
      if (salidaEditando) {
        res = await api.put(`/salidas/${salidaEditando}`, {
          tipo,
          peso_kg: Number(pesoSalida),
          cliente: cliente.trim(),
          razon_social_destino: razonSocial.trim(),
          fecha_salida: `${fechaSalida}T12:00:00`,
          cierra_pieza: cerrarPieza,
          observaciones: observaciones.trim() || null,
        });
      } else {
        res = await api.post('/salidas/', {
          pieza_id: pieza.id,
          tipo,
          peso_kg: Number(pesoSalida),
          cliente: cliente.trim(),
          razon_social_destino: razonSocial.trim(),
          fecha_salida: `${fechaSalida}T12:00:00`,
          peso_salida_camara_kg: pieza.peso_salida_camara_kg ? null : Number(pesoCamara),
          cierra_pieza: cerrarPieza,
          observaciones: observaciones.trim() || null,
        });
      }

      await recargarPieza();
      await cargarCatalogos();
      const advertenciaRespuesta = res.data.advertencia || '';
      const razonActual = razonSocial;
      limpiarFormulario();
      setRazonSocial(razonActual || pieza.firma);
      setMensaje({ texto: salidaEditando ? 'Salida modificada correctamente.' : 'Salida registrada correctamente.', tipo: 'success' });
      setAdvertencia(advertenciaRespuesta);
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo guardar la salida.', tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const borrarSalida = async (salida) => {
    if (!window.confirm(`¿Eliminar la salida ${salida.tipo} de ${salida.peso_kg} kg?`)) return;
    try {
      const res = await api.delete(`/salidas/${salida.id}`);
      await recargarPieza();
      limpiarFormulario();
      setMensaje({ texto: res.data.mensaje, tipo: 'success' });
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo eliminar la salida.', tipo: 'error' });
    }
  };

  const subirLote = async () => {
    if (!archivoCSV) {
      setMensajeLote({ texto: 'Seleccioná un archivo CSV.', tipo: 'error' });
      return;
    }
    const formData = new FormData();
    formData.append('file', archivoCSV);
    try {
      setMensajeLote({ texto: 'Procesando archivo...', tipo: 'info' });
      const res = await api.post('/piezas/salidas-lote/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setMensajeLote({ texto: res.data.mensaje, tipo: 'success', ...res.data });
    } catch (error) {
      setMensajeLote({ texto: error.response?.data?.detail || 'No se pudo procesar el lote.', tipo: 'error' });
    }
  };

  return (
    <div className="page-container page-container-full">
      <section className="card card-elevated content-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Movimientos de cámara</span>
            <h2>Registrar salida</h2>
          </div>
          <span className="status-pill">6 tipos de ítem</span>
        </div>

        <div className="piece-search-grid">
          <div className="field-block">
            <label htmlFor="seleccionar-tropa">1. Seleccionar tropa</label>
            <select
              id="seleccionar-tropa"
              value={tropaSeleccionadaId}
              onChange={(e) => seleccionarTropa(e.target.value)}
              className="input-hero locator-select"
            >
              <option value="">Elegí una tropa</option>
              {tropas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.numero_tropa} · {item.matadero} · {item.firma}
                </option>
              ))}
            </select>
            {tropaSeleccionada && (
              <span className="locator-context">
                {cargandoPiezas ? 'Cargando piezas...' : `${piezasTropa.length} piezas`} · {tropaSeleccionada.matadero}
              </span>
            )}
          </div>

          <div className="field-block" style={{ position: 'relative' }}>
            <label htmlFor="buscar-pieza">2. Buscar número de pieza</label>
            <input
              id="buscar-pieza"
              ref={inputPiezaRef}
              type="number"
              value={numeroBusqueda}
              disabled={!tropaSeleccionadaId || cargandoPiezas || piezasTropa.length === 0}
              onChange={(e) => buscarPiezas(e.target.value)}
              onFocus={() => {
                if (!numeroBusqueda && tropaSeleccionadaId) setResultados(piezasTropa.slice(0, 100));
              }}
              onBlur={() => setTimeout(() => setResultados([]), 120)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const exacta = piezasTropa.find(
                  (item) => String(item.numero_pieza) === numeroBusqueda.trim(),
                );
                if (exacta) seleccionarPieza(exacta);
                else if (resultados.length === 1) seleccionarPieza(resultados[0]);
                else setMensaje({ texto: 'Elegí una pieza de la lista.', tipo: 'error' });
              }}
              placeholder={cargandoPiezas ? 'Cargando piezas...' : 'Ej: 125'}
              className="input-hero"
            />
            {resultados.length > 0 && (
              <div className="search-results">
                {resultados.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      seleccionarPieza(item);
                    }}
                  >
                    <span><strong>Pieza {item.numero_pieza}</strong></span>
                    <span>
                      {item.es_toro ? 'Toro' : 'Novillo'} · {item.peso_entrada_kg} kg · {item.cerrada ? 'Cerrada' : 'Disponible'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {numeroBusqueda && resultados.length === 0 && !pieza && (
              <span className="locator-empty">No existe esa pieza dentro de la tropa seleccionada.</span>
            )}
          </div>
        </div>

        {pieza && (
          <>
            <div className="piece-banner">
              <div>
                <span className="eyebrow">Tropa {pieza.numero_tropa} · {pieza.matadero}</span>
                <h3>Media #{pieza.numero_pieza} {pieza.es_toro ? '· TORO' : ''}</h3>
                <p>{pieza.firma}</p>
              </div>
              <div className="piece-metrics">
                <div><span>Entrada</span><strong>{pieza.peso_entrada_kg} kg</strong></div>
                <div><span>Cámara</span><strong>{pieza.peso_salida_camara_kg || '--'} kg</strong></div>
                <div><span>Saldo</span><strong>{pieza.saldo_kg} kg</strong></div>
                <div><span>Estado</span><strong>{pieza.cerrada ? 'Cerrada' : 'Abierta'}</strong></div>
              </div>
            </div>

            {pieza.cerrada && !salidaEditando && (
              <div className="alert alert-warning" style={{ marginTop: '14px' }}>
                Esta media está cerrada. Podés modificar o borrar una salida registrada para reabrirla.
              </div>
            )}

            {(!pieza.cerrada || salidaEditando) && (
              <div className="movement-form">
                <div className="section-heading compact">
                  <h3>{salidaEditando ? 'Modificar salida' : 'Nueva salida de esta media'}</h3>
                  {esPrestamo && <span className="loan-badge">Préstamo entre razones sociales</span>}
                </div>

                <div className="type-grid">
                  {TIPOS.map((item) => (
                    <button
                      type="button"
                      key={item.value}
                      className={`type-button ${tipo === item.value ? 'active' : ''}`}
                      onClick={() => elegirTipo(item.value)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="form-grid">
                  {!pieza.peso_salida_camara_kg && !salidaEditando && (
                    <div className="field-block">
                      <label>Peso de cámara de la media</label>
                      <input type="number" step="0.01" value={pesoCamara} onChange={(e) => setPesoCamara(e.target.value)} />
                    </div>
                  )}
                  <div className="field-block">
                    <label>Peso de este ítem</label>
                    <input type="number" step="0.01" value={pesoSalida} onChange={(e) => setPesoSalida(e.target.value)} />
                  </div>
                  <div className="field-block">
                    <label>Fecha de salida</label>
                    <input type="date" value={fechaSalida} onChange={(e) => setFechaSalida(e.target.value)} />
                  </div>
                  <Combobox
                    label="Cliente"
                    value={cliente}
                    onChange={setCliente}
                    options={nombresClientes}
                    placeholder="Escribí o elegí un cliente"
                  />
                  <Combobox
                    label="Razón social destino"
                    value={razonSocial}
                    onChange={setRazonSocial}
                    options={nombresFirmas}
                    placeholder="Quién recibe o toma prestada la carne"
                  />
                </div>

                <div className="field-block">
                  <label>Observaciones</label>
                  <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Opcional" />
                </div>

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={cerrarPieza}
                    disabled={tipo === 'Media'}
                    onChange={(e) => setCerrarPieza(e.target.checked)}
                  />
                  <span>Esta salida completa lo que queda de la media</span>
                </label>

                <div className="inline-row" style={{ marginTop: '14px' }}>
                  <button type="button" className="btn-lg btn-success" disabled={guardando} onClick={guardarSalida}>
                    {guardando ? 'Guardando...' : salidaEditando ? 'Guardar modificación' : 'Registrar salida'}
                  </button>
                  {salidaEditando && (
                    <button type="button" className="btn-lg btn-secondary" onClick={() => limpiarFormulario()}>
                      Cancelar edición
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="movement-list">
              <h3>Salidas registradas ({pieza.salidas.length})</h3>
              {pieza.salidas.length === 0 ? (
                <p className="empty-copy">Esta media todavía no tiene salidas.</p>
              ) : (
                <div className="table-scroll">
                  <table className="table-modern">
                    <thead>
                      <tr>
                        <th>Fecha</th><th>Ítem</th><th>Kg</th><th>Cliente</th><th>Razón social</th><th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pieza.salidas.map((salida) => (
                        <tr key={salida.id}>
                          <td>{new Date(salida.fecha_salida).toLocaleDateString('es-AR')}</td>
                          <td><strong>{salida.tipo === 'Vacio' ? 'Vacío' : salida.tipo}</strong>{salida.cierra_pieza ? ' · cierre' : ''}</td>
                          <td>{salida.peso_kg} kg</td>
                          <td>{salida.cliente}</td>
                          <td>
                            {salida.razon_social_destino}
                            {salida.es_prestamo && <span className="loan-dot">Préstamo</span>}
                          </td>
                          <td>
                            <div className="inline-row">
                              <button type="button" className="btn-sm btn-primary" onClick={() => editarSalida(salida)}>Editar</button>
                              <button type="button" className="btn-sm btn-danger" onClick={() => borrarSalida(salida)}>Borrar</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '16px' }}>
            {mensaje.texto}
          </div>
        )}
        {advertencia && <div className="alert alert-warning" style={{ marginTop: '10px' }}>{advertencia}</div>}
      </section>

      <section className="card content-block csv-card">
        <h3>Carga masiva CSV</h3>
        <p>
          Columnas base: <code>tropa, pieza, cliente, peso_camara, corte, peso_corte</code>.
          Opcionales: <code>razon_social, cerrar</code>.
        </p>
        <div className="inline-row">
          <input type="file" accept=".csv" onChange={(e) => setArchivoCSV(e.target.files?.[0] || null)} />
          <button type="button" className="btn-md btn-primary" onClick={subirLote}>Procesar lote</button>
        </div>
        {mensajeLote && (
          <div className={`alert ${mensajeLote.tipo === 'error' ? 'alert-error' : 'alert-success'}`} style={{ marginTop: '12px' }}>
            <strong>{mensajeLote.texto}</strong>
            {mensajeLote.errores?.map((item) => <div key={item}>{item}</div>)}
            {mensajeLote.advertencias?.map((item) => <div key={item}>{item}</div>)}
          </div>
        )}
      </section>
    </div>
  );
};

export default SalidaPiezas;
