import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import NuevaTropa from './components/NuevaTropa';
import CargarPiezas from './components/CargarPiezas';
import SalidaPiezas from './components/SalidaPiezas';
import VistaDetalleTropa from './components/VistaDetalleTropa';
import ResumenSalidas from './components/ResumenSalidas';
import DashboardPrincipal from './components/DashboardPrincipal';

const MenuLink = ({ to, children }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link to={to} className={`menu-link ${isActive ? 'active' : ''}`}>
      {children}
    </Link>
  );
};

function App() {
  return (
    <Router>
      <div className="app-shell">
        <aside className="app-sidebar">
          <h2 className="app-title">Romaneo App</h2>

          <MenuLink to="/">Inicio y Existencia</MenuLink>
          <MenuLink to="/tropas">Ingresar Tropa</MenuLink>
          <MenuLink to="/carga-rafaga">Carga Rapida</MenuLink>
          <MenuLink to="/salidas">Salidas y Stock</MenuLink>
          <MenuLink to="/resumen-salidas">Resumen de Salidas</MenuLink>
          <MenuLink to="/monitor">Monitor de Tropa</MenuLink>
        </aside>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<DashboardPrincipal />} />
            <Route path="/tropas" element={<NuevaTropa />} />
            <Route path="/carga-rafaga" element={<CargarPiezas />} />
            <Route path="/salidas" element={<SalidaPiezas />} />
            <Route path="/resumen-salidas" element={<ResumenSalidas />} />
            <Route path="/monitor" element={<VistaDetalleTropa />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
