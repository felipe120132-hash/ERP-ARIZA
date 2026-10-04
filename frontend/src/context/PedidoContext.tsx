import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Producto } from "@/types/schemas";
import { remisionesService } from "@/services/remisionesService";
export type LineaPedido = { producto: Producto; cantidad: string };
function usePedidoState() {
  const [lineas, setLineas] = useState<LineaPedido[]>([]),
    [cliente, setCliente] = useState(""),
    [pago, setPago] = useState<"CONTADO" | "CREDITO">("CONTADO"),
    [iva, setIva] = useState(true),
    [enviando, setEnviando] = useState(false),
    [error, setError] = useState<string | null>(null),
    [incierto, setIncierto] = useState(false),
    [creada, setCreada] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    if (!lineas.length && !enviando) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [lineas.length, enviando]);
  function agregar(producto: Producto) {
    if (lock.current || incierto) return;
    setCreada(null);
    setLineas((actual) => {
      const item = actual.find((x) => x.producto.id === producto.id);
      return item
        ? actual.map((x) =>
            x === item
              ? {
                  producto,
                  cantidad: String(
                    Math.min(
                      producto.stock_actual,
                      (Number(x.cantidad) || 0) + 1,
                    ),
                  ),
                }
              : x,
          )
        : [
            ...actual,
            { producto, cantidad: String(Math.min(1, producto.stock_actual)) },
          ];
    });
  }
  function cantidad(id: string, value: string) {
    if (!lock.current && !incierto)
      setLineas((actual) =>
        actual.map((x) =>
          x.producto.id === id ? { ...x, cantidad: value } : x,
        ),
      );
  }
  function quitar(id: string) {
    if (!lock.current && !incierto)
      setLineas((actual) => actual.filter((x) => x.producto.id !== id));
  }
  async function confirmar() {
    if (lock.current || incierto) return null;
    lock.current = true;
    setEnviando(true);
    setError(null);
    try {
      const result = await remisionesService.crearRemision({
        p_cliente_id: cliente,
        p_tipo_pago: pago,
        p_aplica_iva: iva,
        p_items: lineas.map((x) => ({
          producto_id: x.producto.id,
          cantidad: Number(x.cantidad),
        })),
      });
      if (result.error || !result.data) {
        setError(
          result.error ?? "No recibimos el identificador de la remisión.",
        );
        setIncierto(Boolean(result.incierto));
        return null;
      }
      setCreada(result.data);
      setLineas([]);
      return result.data;
    } catch {
      setIncierto(true);
      setError(
        "La conexión se interrumpió. Revisa el historial antes de volver a crear el pedido.",
      );
      return null;
    } finally {
      lock.current = false;
      setEnviando(false);
    }
  }
  return {
    lineas,
    agregar,
    cantidad,
    quitar,
    cliente,
    setCliente,
    pago,
    setPago,
    iva,
    setIva,
    enviando,
    error,
    incierto,
    creada,
    confirmar,
  };
}
const PedidoContext = createContext<ReturnType<typeof usePedidoState> | null>(
  null,
);
export function PedidoProvider({ children }: { children: ReactNode }) {
  const pedido = usePedidoState();
  return (
    <PedidoContext.Provider value={pedido}>{children}</PedidoContext.Provider>
  );
}
export function usePedido() {
  const value = useContext(PedidoContext);
  if (!value) throw new Error("PedidoProvider requerido");
  return value;
}
