import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Layers3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services/authService";
import { useAuth } from "@/context/AuthContext";
export default function Login() {
  const {
    user,
    perfil,
    loading,
    error: sessionError,
    retry,
    signOut,
  } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const from =
    typeof location.state?.from === "string" &&
    location.state.from.startsWith("/") &&
    !location.state.from.startsWith("//") &&
    location.state.from !== "/login"
      ? location.state.from
      : "/catalogo";
  if (user && perfil?.activo && !loading) return <Navigate to={from} replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setError(await authService.signIn(email.trim(), password));
    } catch {
      setError("No pudimos iniciar sesión. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-shell">
      <section className="login-story">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>Ariza One</strong>
            <small>DISTRIBUCIONES ARIZA</small>
          </div>
        </div>
        <div className="story-content">
          <span className="eyebrow">TODO EN SU LUGAR</span>
          <h1>
            Tu operación.
            <br />
            Más clara.
          </h1>
          <p>
            Productos, clientes y decisiones.
            <br />
            Un solo espacio para avanzar cada día.
          </p>
          <div className="story-visual" aria-hidden="true">
            <div className="visual-top">
              <Layers3 size={22} />
              <span>Una operación conectada</span>
              <span className="live-dot" />
            </div>
            <div className="visual-line">
              <span>Catálogo</span>
              <div />
              <b>01</b>
            </div>
            <div className="visual-line">
              <span>Pedidos</span>
              <div />
              <b>02</b>
            </div>
            <div className="visual-line">
              <span>Cartera</span>
              <div />
              <b>03</b>
            </div>
            <div className="visual-bottom">
              DISTRIBUCIONES ARIZA <ArrowRight size={16} />
            </div>
          </div>
        </div>
        <small className="story-footer">El detalle hace la diferencia.</small>
      </section>
      <section className="login-form-area">
        <div className="login-form">
          <span className="eyebrow">BIENVENIDO DE NUEVO</span>
          <h2>Ingresa a tu espacio</h2>
          <p className="muted">Usa tu cuenta de Distribuciones Ariza.</p>
          {user && sessionError ? (
            <div className="space-y-4">
              <div className="error-box" role="alert">
                {sessionError}
              </div>
              <Button onClick={retry}>Volver a verificar acceso</Button>
              <Button
                variant="outline"
                onClick={() => void signOut().catch((e) => setError(e.message))}
              >
                Cambiar de cuenta
              </Button>
              {error && <p role="alert">{error}</p>}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="tu.nombre@empresa.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy || loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="password-field">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Tu contraseña"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy || loading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={
                      show ? "Ocultar contraseña" : "Mostrar contraseña"
                    }
                    onClick={() => setShow(!show)}
                  >
                    {show ? <EyeOff size={18} /> : <Eye size={18} />}
                  </Button>
                </div>
              </div>
              {(error || sessionError) && (
                <div className="error-box" role="alert">
                  {error || sessionError}
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={busy || loading}
              >
                {busy || loading ? "Verificando acceso…" : "Iniciar sesión"}
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
          <div className="login-help">
            <ShieldCheck size={17} />
            <span>
              Acceso exclusivo para el equipo.
              <br />
              Si necesitas una cuenta, contacta al administrador.
            </span>
          </div>
        </div>
        <small className="login-footer">Ariza One · ERP operativo</small>
      </section>
    </div>
  );
}
