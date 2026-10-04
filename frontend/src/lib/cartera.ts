export const formatCOP = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
export function validarMonto(value: string, saldo: number): string | null {
  if (!value.trim()) return "Ingresa el monto del abono.";
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0)
    return "El monto debe ser mayor a cero.";
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
    return "Usa como máximo dos decimales.";
  if (Math.round(amount * 100) > Math.round(saldo * 100))
    return "El abono no puede superar el saldo del cliente.";
  return null;
}
