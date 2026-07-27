import { useEffect, useMemo, useState } from 'react';
import api from '../api';


const GestionClientes = () => {
  const [clientes, setClientes] = useState([]);
  const [firmas, setFirmas] = useState([]);
  const [asignaciones, setAsignaciones] = useState({});
  const [nombre, setNombre] = useState('');
  const [razonSocialId, setRazonSocialId] = useState('');
  const [filtro, setFiltro] = useState('');
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const cargarDatos = async () => {
    try {
      const [resClientes, resFirmas] = await Promise.all([
        api.get('/clientes/'),
        api.get('/firmas/'),
      ]);
      setClientes(resClientes.data);
      setFirmas(resFirmas.data);
      setAsignaciones(Object.fromEntries(
        resClientes.data.map((cliente) => [cliente.id, cliente.razon_social_id || '']),
      ));
    } catch (error) {
      setMensaje({
        texto: error.response?.data?.detail || 'No se pudo cargar el catálogo de clientes.',
        tipo: 'error',
      });
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargarDatos();
  }, []);

  const clientesFiltrados = useMemo(() => {
    const texto = filtro.trim().toLocaleLowerCase('es');
    if (!texto) return clientes;
    return clientes.filter((cliente) => (
      cliente.nombre.toLocaleLowerCase('es').includes(texto)
      || cliente.razon_social?.nombre?.toLocaleLowerCase('es').includes(texto)
    ));
  }, [clientes, filtro]);

  const crearCliente = async (event) => {
    event.preventDefault();
    if (!nombre.trim()) {
      setMensaje({ texto: 'Ingresá el nombre del cliente.', tipo: 'error' });
      return;
    }

    setGuardando('nuevo');
    try {
      await api.post('/clientes/', {
        nombre: nombre.trim(),
        razon_social_id: razonSocialId ? Number(razonSocialId) : null,
      });
      setNombre('');
      setRazonSocialId('');
      await cargarDatos();
      setMensaje({ texto: 'Cliente guardado correctamente.', tipo: 'success' });
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo guardar el cliente.', tipo: 'error' });
    } finally {
      setGuardando(null);
    }
  };

  const guardarRelacion = async (cliente) => {
    setGuardando(cliente.id);
    try {
      const firmaId = asignaciones[cliente.id];
      await api.put(`/clientes/${cliente.id}`, {
        nombre: cliente.nombre,
        razon_social_id: firmaId ? Number(firmaId) : null,
      });
      await cargarDatos();
      setMensaje({ texto: `Relación de ${cliente.nombre} actualizada.`, tipo: 'success' });
    } catch (error) {
      setMensaje({ texto: error.response?.data?.detail || 'No se pudo actualizar la relación.', tipo: 'error' });
    } finally {
      setGuardando(null);
    }
  };

  return (
    <div className="page-container page-container-full client-admin-page">
      <section className="card card-elevated content-block">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Catálogo comercial</span>
            <h2>Clientes y razones sociales</h2>
            <p>La razón social asignada se completará automáticamente al registrar una salida.</p>
          </div>
          <span className="status-pill">{clientes.length} clientes</span>
        </div>

        <form className="client-create-grid" onSubmit={crearCliente}>
          <div className="field-block">
            <label htmlFor="nuevo-cliente">Nuevo cliente</label>
            <input
              id="nuevo-cliente"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Ej: R. Peña"
            />
          </div>
          <div className="field-block">
            <label htmlFor="nueva-razon-cliente">Razón social predeterminada</label>
            <select
              id="nueva-razon-cliente"
              value={razonSocialId}
              onChange={(event) => setRazonSocialId(event.target.value)}
            >
              <option value="">Sin asignar por ahora</option>
              {firmas.map((firma) => <option key={firma.id} value={firma.id}>{firma.nombre}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-lg btn-success" disabled={guardando === 'nuevo'}>
            {guardando === 'nuevo' ? 'Guardando...' : 'Crear cliente'}
          </button>
        </form>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === 'success' ? 'alert-success' : 'alert-error'}`}>
            {mensaje.texto}
          </div>
        )}
      </section>

      <section className="card content-block">
        <div className="section-heading compact">
          <div>
            <h3>Relaciones actuales</h3>
            <p>Podés cambiar la razón social sin modificar las salidas históricas.</p>
          </div>
          <input
            className="input-compact-lg"
            value={filtro}
            onChange={(event) => setFiltro(event.target.value)}
            placeholder="Buscar cliente o razón social"
          />
        </div>

        {clientesFiltrados.length === 0 ? (
          <p className="empty-copy">No hay clientes que coincidan con la búsqueda.</p>
        ) : (
          <div className="table-scroll">
            <table className="table-modern client-table">
              <thead>
                <tr><th>Cliente</th><th>Razón social predeterminada</th><th>Estado</th><th>Acción</th></tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((cliente) => (
                  <tr key={cliente.id}>
                    <td><strong>{cliente.nombre}</strong></td>
                    <td>
                      <select
                        value={asignaciones[cliente.id] || ''}
                        onChange={(event) => setAsignaciones((actuales) => ({
                          ...actuales,
                          [cliente.id]: event.target.value,
                        }))}
                      >
                        <option value="">Sin razón social asignada</option>
                        {firmas.map((firma) => <option key={firma.id} value={firma.id}>{firma.nombre}</option>)}
                      </select>
                    </td>
                    <td>
                      <span className={`status-pill ${cliente.razon_social ? '' : 'status-pill-warning'}`}>
                        {cliente.razon_social ? 'Vinculado' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-md btn-primary"
                        disabled={guardando === cliente.id}
                        onClick={() => guardarRelacion(cliente)}
                      >
                        {guardando === cliente.id ? 'Guardando...' : 'Guardar relación'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};


export default GestionClientes;
