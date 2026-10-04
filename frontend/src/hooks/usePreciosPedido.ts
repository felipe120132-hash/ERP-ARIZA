import { useEffect, useState } from "react";
import type { PrecioCliente } from "@/types/schemas";
import { consultarPreciosPedido } from "@/services/preciosPedidoService";
export function usePreciosPedido(clienteId: string) {
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      id: string;
      data: PrecioCliente[] | null;
      error: string | null;
    }>({ id: "", data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ id: clienteId, data: null, error: null });
    if (clienteId)
      consultarPreciosPedido(clienteId)
        .then((data) => {
          if (live) setState({ id: clienteId, data, error: null });
        })
        .catch((e) => {
          if (live)
            setState({
              id: clienteId,
              data: null,
              error:
                e instanceof Error
                  ? e.message
                  : "Consulta de precios no disponible.",
            });
        });
    return () => {
      live = false;
    };
  }, [clienteId, attempt]);
  const current = state.id === clienteId;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: !!clienteId && (!current || (!state.data && !state.error)),
    refresh: () => {
      setState({ id: clienteId, data: null, error: null });
      setAttempt((x) => x + 1);
    },
  };
}
