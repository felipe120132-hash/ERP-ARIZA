import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { RutaProtegida } from "@/components/layout/RutaProtegida";
import AppLayout from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import ModulePending from "@/pages/ModulePending";
const AdministrarCliente = lazy(() => import("@/pages/AdministrarCliente"));
const ProductosAdmin = lazy(() => import("@/pages/ProductosAdmin"));
const AdministrarProducto = lazy(() => import("@/pages/AdministrarProducto"));
const Resumen = lazy(() => import("@/pages/Resumen"));
const Finanzas = lazy(() => import("@/pages/Finanzas"));
const Inventario = lazy(() => import("@/pages/Inventario"));
const Kardex = lazy(() => import("@/pages/Kardex"));
const Cartera = lazy(() => import("@/pages/Cartera"));
const ClienteDetalle = lazy(() => import("@/pages/ClienteDetalle"));
const Remisiones = lazy(() => import("@/pages/Remisiones"));
const DetalleRemision = lazy(() => import("@/pages/DetalleRemision"));
const Catalogo = lazy(() => import("@/pages/Catalogo"));
export default function App() {
  return (
    <BrowserRouter>
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RutaProtegida />}>
            <Route element={<AppLayout />}>
              <Route
                path="productos"
                element={
                  <Suspense
                    fallback={<div role="status">Cargando productos…</div>}
                  >
                    <ProductosAdmin />
                  </Suspense>
                }
              />
              <Route
                path="productos/nuevo"
                element={
                  <Suspense
                    fallback={<div role="status">Cargando producto…</div>}
                  >
                    <AdministrarProducto />
                  </Suspense>
                }
              />
              <Route
                path="productos/:id/editar"
                element={
                  <Suspense
                    fallback={<div role="status">Cargando producto…</div>}
                  >
                    <AdministrarProducto />
                  </Suspense>
                }
              />
              <Route
                path="remisiones"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Remisiones />
                  </Suspense>
                }
              />
              <Route
                path="remisiones/:id"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <DetalleRemision />
                  </Suspense>
                }
              />
              <Route
                path="cartera"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Cartera />
                  </Suspense>
                }
              />
              <Route
                path="cartera/:id"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <ClienteDetalle />
                  </Suspense>
                }
              />
              <Route
                path="inventario"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Inventario />
                  </Suspense>
                }
              />
              <Route
                path="inventario/:id"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Kardex />
                  </Suspense>
                }
              />
              <Route
                path="cartera/nuevo"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <AdministrarCliente />
                  </Suspense>
                }
              />
              <Route
                path="cartera/:id/administrar"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <AdministrarCliente />
                  </Suspense>
                }
              />
              <Route index element={<Navigate to="/catalogo" replace />} />
              <Route
                path="catalogo"
                element={
                  <Suspense
                    fallback={
                      <div className="empty-state" role="status">
                        Cargando catálogo…
                      </div>
                    }
                  >
                    <Catalogo />
                  </Suspense>
                }
              />
              <Route
                path="finanzas"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Finanzas />
                  </Suspense>
                }
              />
              <Route
                path="resumen"
                element={
                  <Suspense fallback={<div role="status">Cargando…</div>}>
                    <Resumen />
                  </Suspense>
                }
              />
              {["documentos", "*"].map((path) => (
                <Route key={path} path={path} element={<ModulePending />} />
              ))}
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
