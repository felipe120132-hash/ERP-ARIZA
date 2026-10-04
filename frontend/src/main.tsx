import { StrictMode, lazy, Suspense, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
const App = lazy(() => import("./App"));
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="session-loading">
        <h1>No pudimos abrir tu espacio</h1>
        <p>
          Recarga la página. Si el problema continúa, contacta al administrador.
        </p>
        <button onClick={() => location.reload()}>Recargar</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const configured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() &&
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim(),
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {configured ? (
        <Suspense
          fallback={
            <div className="session-loading" role="status">
              Abriendo Ariza One…
            </div>
          }
        >
          <App />
        </Suspense>
      ) : (
        <div className="session-loading">
          <div className="brand-mark">A</div>
          <h1>Ariza One</h1>
          <p>La conexión todavía no está configurada.</p>
          <p>
            Contacta al responsable de la instalación para habilitar el acceso.
          </p>
        </div>
      )}
    </ErrorBoundary>
  </StrictMode>,
);
