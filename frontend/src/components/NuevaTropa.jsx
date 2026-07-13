import { useState, useEffect } from 'react';
import api from '../api';

const NuevaTropa = () => {
  const [numeroTropa, setNumeroTropa] = useState('');
  const [matadero, setMatadero] = useState('');
  const [firma, setFirma] = useState('');
  const [listaFirmas, setListaFirmas] = useState([]);
  const [nuevaFirma, setNuevaFirma] = useState('');
  const [fechaIngreso, setFechaIngreso] = useState('');

  const [listaProveedores, setListaProveedores] = useState([]);
  const [busquedaProveedor, setBusquedaProveedor] = useState('');
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);

  const [tropas, setTropas] = useState([]);
  const [idEditando, setIdEditando] = useState(null);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const cargarDatos = async () => {
    try {
      const [resP, resT, resF] = await Promise.all([
        api.get('/proveedores/'),
        api.get('/tropas/'),
        api.get('/firmas/'),
      ]);
      setListaProveedores(resP.data);
      setTropas(resT.data);
      setListaFirmas(resF.data);
    } catch (error) {
      console.error('Error al cargar datos', error);
    }
  };

  const crearFirmaOnTheFly = async () => {
    const nombre = nuevaFirma.trim();
    if (!nombre) {
      setMensaje({ texto: 'Escribi el nombre de la firma consignataria.', tipo: 'error' });
      return;
    }
    try {
      const res = await api.post('/firmas/', { nombre, es_propia: false });
      setListaFirmas((actuales) => {
        if (actuales.some((item) => item.id === res.data.id)) return actuales;
        return [...actuales, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
      setFirma(res.data.nombre);
      setNuevaFirma('');
      setMensaje({ texto: 'Firma consignataria creada y seleccionada.', tipo: 'success' });
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo crear la firma.', tipo: 'error' });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, []);

  const proveedoresFiltrados = listaProveedores.filter((p) =>
    p.nombre.toLowerCase().includes(busquedaProveedor.toLowerCase()),
  );

  const crearProveedorOnTheFly = async () => {
    try {
      const res = await api.post('/proveedores/', { nombre: busquedaProveedor });
      setListaProveedores([...listaProveedores, res.data]);
      setProveedorSeleccionado(res.data);
      setBusquedaProveedor(res.data.nombre);
      setMensaje({ texto: 'Proveedor registrado.', tipo: 'success' });
    } catch {
      setMensaje({ texto: 'Error al registrar proveedor.', tipo: 'error' });
    }
  };

  const activarEdicion = (tropa) => {
    setIdEditando(tropa.id);
    setNumeroTropa(tropa.numero_tropa);
    setMatadero(tropa.matadero);
    setFirma(tropa.firma);
    setFechaIngreso(tropa.fecha_ingreso ? tropa.fecha_ingreso.slice(0, 10) : '');

    if (tropa.proveedor) {
      setProveedorSeleccionado(tropa.proveedor);
      setBusquedaProveedor(tropa.proveedor.nombre);
    } else {
      setProveedorSeleccionado(null);
      setBusquedaProveedor('');
    }

    setMensaje({
      texto: `Editando tropa ${tropa.numero_tropa}. Modifica los campos y guarda.`,
      tipo: 'success',
    });
  };

  const cancelarEdicion = () => {
    setIdEditando(null);
    setNumeroTropa('');
    setMatadero('');
    setFirma('');
    setFechaIngreso('');
    setBusquedaProveedor('');
    setProveedorSeleccionado(null);
    setMensaje({ texto: '', tipo: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!proveedorSeleccionado) {
      setMensaje({ texto: 'Selecciona o crea un proveedor.', tipo: 'error' });
      return;
    }

    const payload = {
      numero_tropa: numeroTropa,
      matadero,
      firma,
      proveedor_id: proveedorSeleccionado.id,
      fecha_ingreso: fechaIngreso ? `${fechaIngreso}T00:00:00` : null,
    };

    try {
      if (idEditando) {
        await api.put(`/tropas/${idEditando}`, payload);
        setMensaje({ texto: 'Tropa actualizada correctamente.', tipo: 'success' });
      } else {
        await api.post('/tropas/', payload);
        setMensaje({ texto: 'Tropa creada correctamente.', tipo: 'success' });
      }

      cancelarEdicion();
      cargarDatos();
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Error al procesar la tropa';
      setMensaje({ texto: errorMsg, tipo: 'error' });
    }
  };

  return (
    <div className="page-container">
      <section className="card card-elevated content-block">
        <h2>{idEditando ? `Editar Tropa ${numeroTropa}` : 'Ingresar Nueva Tropa'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="field-block">
            <label htmlFor="numero-tropa">1. Numero de Tropa</label>
            <input
              id="numero-tropa"
              type="text"
              value={numeroTropa}
              onChange={(e) => setNumeroTropa(e.target.value)}
              placeholder="Ej: 1452"
              required
            />
          </div>

          <div className="field-block">
            <label htmlFor="matadero">2. Matadero</label>
            <select
              id="matadero"
              value={matadero}
              onChange={(e) => setMatadero(e.target.value)}
              required
            >
              <option value="">Selecciona un matadero</option>
              <option value="Vildoza">Vildoza</option>
              <option value="Maria del Carmen">Maria del Carmen</option>
            </select>
          </div>

          <div className="field-block">
            <label htmlFor="firma">3. Firma Consignataria</label>
            <select
              id="firma"
              value={firma}
              onChange={(e) => setFirma(e.target.value)}
              required
            >
              <option value="">Selecciona una firma</option>
              {listaFirmas.map((item) => (
                <option key={item.id} value={item.nombre}>
                  {item.nombre}{item.es_propia ? ' (propia)' : ''}
                </option>
              ))}
            </select>
            <div className="inline-row" style={{ marginTop: '8px', alignItems: 'center' }}>
              <input
                type="text"
                value={nuevaFirma}
                onChange={(e) => setNuevaFirma(e.target.value)}
                placeholder="Nueva firma o razon social que presto la carne"
                style={{ flex: 1, minWidth: '260px' }}
              />
              <button type="button" className="btn-md btn-secondary" onClick={crearFirmaOnTheFly}>
                Crear firma
              </button>
            </div>
          </div>

          <div className="field-block section-soft" style={{ padding: '12px' }}>
            <label htmlFor="buscar-proveedor">4. Buscar o Crear Proveedor</label>
            <input
              id="buscar-proveedor"
              type="text"
              placeholder="Escribe para buscar proveedor..."
              value={busquedaProveedor}
              onChange={(e) => {
                setBusquedaProveedor(e.target.value);
                setProveedorSeleccionado(null);
              }}
            />

            {busquedaProveedor && !proveedorSeleccionado && (
              <div className="list-popover">
                {proveedoresFiltrados.map((p) => (
                  <div
                    key={p.id}
                    className="list-option"
                    onClick={() => {
                      setProveedorSeleccionado(p);
                      setBusquedaProveedor(p.nombre);
                    }}
                  >
                    {p.nombre}
                  </div>
                ))}

                {proveedoresFiltrados.length === 0 && (
                  <div style={{ padding: '8px', textAlign: 'center' }}>
                    <button type="button" className="btn-sm btn-primary" onClick={crearProveedorOnTheFly}>
                      Crear "{busquedaProveedor}"
                    </button>
                  </div>
                )}
              </div>
            )}

            {proveedorSeleccionado && (
              <div className="status-chip">Proveedor: {proveedorSeleccionado.nombre}</div>
            )}
          </div>

          <div className="field-block">
            <label htmlFor="fecha-ingreso">5. Fecha de Carga</label>
            <input
              id="fecha-ingreso"
              type="date"
              value={fechaIngreso}
              onChange={(e) => setFechaIngreso(e.target.value)}
              required
            />
          </div>

          <div className="inline-row" style={{ alignItems: 'stretch' }}>
            <button
              type="submit"
              className={`btn-lg ${idEditando ? 'btn-warning' : 'btn-success'}`}
              style={{ flex: 1 }}
            >
              {idEditando ? 'Actualizar Tropa' : 'Guardar Tropa'}
            </button>

            {idEditando && (
              <button type="button" onClick={cancelarEdicion} className="btn-lg btn-secondary">
                Cancelar
              </button>
            )}
          </div>
        </form>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`} style={{ marginTop: '14px' }}>
            {mensaje.texto}
          </div>
        )}
      </section>

      <section className="card content-block">
        <h3>Tropas Registradas</h3>

        {tropas.length === 0 ? (
          <p style={{ color: '#64748b' }}>No hay tropas cargadas aun.</p>
        ) : (
          <table className="table-modern" style={{ marginTop: '10px' }}>
            <thead>
              <tr>
                <th>Nro Tropa</th>
                <th>Matadero</th>
                <th>Firma</th>
                <th>Proveedor</th>
                <th>Fecha Carga</th>
                <th style={{ textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tropas.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.numero_tropa}</strong></td>
                  <td>{t.matadero}</td>
                  <td>{t.firma}</td>
                  <td>{t.proveedor?.nombre || 'Sin especificar'}</td>
                  <td>{t.fecha_ingreso ? new Date(t.fecha_ingreso).toLocaleDateString('es-AR') : '--'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button onClick={() => activarEdicion(t)} className="btn-sm btn-primary">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};

export default NuevaTropa;
