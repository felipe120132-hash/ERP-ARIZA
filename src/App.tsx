import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { RutaProtegida } from './components/layout/RutaProtegida';
import Login from './pages/Login';
import Catalogo from './pages/Catalogo';
import CrearPedido from './pages/CrearPedido';
import Cartera from './pages/Cartera';
import Gastos from './pages/Gastos';
import Dashboard from './pages/Dashboard';
import OneDriveCallback from './pages/OneDriveCallback';
import './styles/App.css';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-container">
          <Navbar />
          <div className="app-body">
            <Sidebar />
            <main className="app-content">
              <nav style={{ display: 'flex', gap: '1rem', padding: '1rem 0' }}>
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/catalogo">Catálogo</Link>
                <Link to="/crear-pedido">Crear Pedido</Link>
                <Link to="/cartera">Cartera</Link>
                <Link to="/gastos">Gastos</Link>
                <Link to="/login">Login</Link>
              </nav>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* Rutas accesibles para usuarios autenticados (ADMIN y VENDEDOR) */}
                <Route
                  path="/dashboard"
                  element={
                    <RutaProtegida>
                      <Dashboard />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/catalogo"
                  element={
                    <RutaProtegida>
                      <Catalogo />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/crear-pedido"
                  element={
                    <RutaProtegida>
                      <CrearPedido />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/cartera"
                  element={
                    <RutaProtegida>
                      <Cartera />
                    </RutaProtegida>
                  }
                />
                <Route
                  path="/onedrive/callback"
                  element={
                    <RutaProtegida>
                      <OneDriveCallback />
                    </RutaProtegida>
                  }
                />

                {/* Ruta protegida exclusiva para rol ADMIN */}
                <Route
                  path="/gastos"
                  element={
                    <RutaProtegida rolesPermitidos={['ADMIN']}>
                      <Gastos />
                    </RutaProtegida>
                  }
                />
              </Routes>
            </main>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
