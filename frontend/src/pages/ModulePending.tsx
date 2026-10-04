import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
const modules: Record<string, [string, string]> = {
  "/resumen": [
    "Resumen de operación",
    "Aquí reuniremos ventas, cartera y alertas con información de tu operación.",
  ],
  "/inventario": [
    "Inventario y alertas",
    "El historial de movimientos y las herramientas de inventario se incorporarán en la siguiente entrega.",
  ],
  "/cartera": [
    "Cartera y clientes",
    "Aquí podrás consultar saldos, revisar el historial y registrar abonos.",
  ],
  "/finanzas": [
    "Finanzas y gastos",
    "Este espacio reunirá los gastos operacionales y el resumen financiero mensual.",
  ],
  "/documentos": [
    "Centro documental",
    "Aquí reuniremos las remisiones y documentos cuando esté lista la integración con OneDrive.",
  ],
};
export default function ModulePending() {
  const { pathname } = useLocation();
  const { perfil } = useAuth();
  const forbidden = pathname === "/finanzas" && perfil?.rol !== "ADMIN";
  const [title, description] = forbidden
    ? [
        "Acceso restringido",
        "Este módulo está disponible para administradores.",
      ]
    : (modules[pathname] ?? [
        "Página no encontrada",
        "La dirección que buscas no está disponible.",
      ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ARIZA ONE / TU ESPACIO</span>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="pending-panel">
        <div className="pending-symbol">
          <Layers3 size={38} strokeWidth={1} />
        </div>
        <span className="eyebrow">
          {forbidden
            ? "PERMISOS DE ACCESO"
            : modules[pathname]
              ? "PRÓXIMA ENTREGA"
              : "404"}
        </span>
        <h2>
          {forbidden
            ? "Este espacio requiere otro permiso"
            : modules[pathname]
              ? "Estamos preparando este espacio."
              : "Volvamos al catálogo."}
        </h2>
        <p>{description}</p>
        <Button asChild>
          <Link to="/catalogo">
            Ir al catálogo <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
    </>
  );
}
