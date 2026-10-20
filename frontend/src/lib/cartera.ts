import type { AbonoCartera, Remision } from "@/types/schemas";

export const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export function validarMonto(
  value: string,
  saldo: number,
  maxRemision?: number | null,
): string | null {
  if (!value.trim()) return "Ingresa el monto del abono.";
  const amount = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0)
    return "El monto debe ser mayor a cero.";
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
    return "Usa como máximo dos decimales.";
  if (Math.round(amount * 100) > Math.round(saldo * 100))
    return "El abono no puede superar el saldo del cliente.";
  if (
    maxRemision !== undefined &&
    maxRemision !== null &&
    Math.round(amount * 100) > Math.round(maxRemision * 100)
  )
    return `El abono no puede superar el saldo pendiente de la remisión (${formatCOP(maxRemision)}).`;
  return null;
}

export function calcularSaldosRemision(
  remision: Remision,
  abonos: AbonoCartera[],
  excluirAbonoId?: string,
) {
  const abonadoCents = abonos
    .filter((a) => a.remision_id === remision.id && a.id !== excluirAbonoId)
    .reduce((sum, a) => sum + Math.round(a.monto * 100), 0);
  const totalCents = Math.round(remision.total * 100);
  const pendienteCents =
    remision.estado === "ANULADA"
      ? 0
      : remision.tipo_pago === "CONTADO"
        ? 0
        : Math.max(0, totalCents - abonadoCents);
  return {
    abonado: abonadoCents / 100,
    pendiente: pendienteCents / 100,
    excede: abonadoCents > totalCents,
  };
}
