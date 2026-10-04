import BrandLogo from "@/components/BrandLogo";
import { PedidoProvider } from "@/context/PedidoContext";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Wallet,
  ChartNoAxesCombined,
  Files,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
const navigation = [
  { path: "/resumen", label: "Resumen", icon: LayoutDashboard },
  { path: "/catalogo", label: "Catálogo", icon: Package },
  { path: "/remisiones", label: "Remisiones", icon: Files },
  { path: "/inventario", label: "Inventario", icon: Boxes },
  { path: "/cartera", label: "Cartera y clientes", icon: Wallet },
  {
    path: "/finanzas",
    label: "Finanzas y gastos",
    icon: ChartNoAxesCombined,
    admin: true,
  },
  { path: "/documentos", label: "Documentos", icon: Files },
];
function Navigation({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { perfil, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <NavLink to="/catalogo" className="brand" onClick={onNavigate}>
        <BrandLogo />
        {!collapsed && (
          <div>
            <strong>Ariza One</strong>
            <small>ERP OPERATIVO</small>
          </div>
        )}
      </NavLink>
      <div className="nav-section">{collapsed ? "···" : "OPERACIÓN"}</div>
      <nav className="main-nav" aria-label="Navegación principal">
        {navigation
          .filter((item) => !item.admin || perfil?.rol === "ADMIN")
          .map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              onClick={onNavigate}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
      </nav>
      {!collapsed && (
        <div className="sidebar-note">
          <span className="live-dot" /> Tu operación, en un solo lugar.
        </div>
      )}
      <div className="profile-card">
        <div className="profile-avatar">
          {perfil?.nombre_completo
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0])
            .join("")}
        </div>
        {!collapsed && (
          <div className="profile-name">
            <strong>{perfil?.nombre_completo}</strong>
            <small>
              {perfil?.rol === "ADMIN" ? "Administrador" : "Vendedor"}
            </small>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signOut();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "No pudimos cerrar sesión.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={16} />
        </Button>
      </div>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export default function AppLayout() {
  const { user } = useAuth();
  return (
    <PedidoProvider key={user?.id}>
      <LayoutContent />
    </PedidoProvider>
  );
}
function LayoutContent() {
  const [collapsed, setCollapsed] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const item = location.pathname.startsWith("/productos")
    ? { label: "Administrar productos" }
    : navigation.find(
        (item) =>
          location.pathname === item.path ||
          location.pathname.startsWith(`${item.path}/`),
      );
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="desktop-sidebar">
        <Navigation collapsed={collapsed} />
        <Button
          variant="ghost"
          className="collapse-control"
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <>
              <PanelLeftClose size={18} />
              <span>Contraer menú</span>
            </>
          )}
        </Button>
      </aside>
      <div className="workspace">
        <header className="workspace-header">
          <div className="breadcrumb">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  className="mobile-menu"
                  variant="ghost"
                  size="icon"
                  aria-label="Abrir menú"
                >
                  <Menu size={19} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetTitle className="sr-only">
                  Navegación de Ariza One
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Accede a los módulos de tu operación.
                </SheetDescription>
                <Navigation onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <span>Mi espacio</span>
            <ChevronRight size={13} />
            <strong>{item?.label ?? "Página"}</strong>
          </div>
          <span className="header-date">
            {new Intl.DateTimeFormat("es-CO", {
              day: "numeric",
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </span>
        </header>
        <main id="contenido" className="page-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Distribuciones Ariza</span>
          <span>Orden para crecer.</span>
        </footer>
      </div>
    </div>
  );
}
