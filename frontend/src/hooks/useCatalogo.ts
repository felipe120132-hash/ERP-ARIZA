import { useCallback, useEffect, useRef, useState } from "react";
import { productosService } from "@/services/productosService";
import { obtenerImagenes } from "@/services/imagenesService";
import type { Producto, AlertaStock } from "@/types/schemas";
export function useCatalogo() {
  const [products, setProducts] = useState<Producto[]>([]);
  const [alerts, setAlerts] = useState<AlertaStock[]>([]);
  const [images, setImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const version = useRef(0);
  const reload = useCallback(async () => {
    const request = ++version.current;
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const [productResult, alertResult] = await Promise.all([
        productosService.listarProductos(),
        productosService.listarAlertasStock(),
      ]);
      if (request !== version.current) return;
      if (productResult.error) {
        setError(productResult.error);
        setProducts([]);
        setAlerts([]);
        return;
      }
      const active = (productResult.data ?? []).filter(
        (product) => product.activo,
      );
      setProducts(active);
      setAlerts(alertResult.data ?? []);
      if (alertResult.error)
        setWarning(
          "No pudimos cargar las alertas de stock. Puedes consultar las existencias, pero los estados no están disponibles.",
        );
      const urls = await obtenerImagenes(
        active.flatMap((product) =>
          product.imagen_path ? [product.imagen_path] : [],
        ),
      );
      if (request === version.current) setImages(urls);
    } catch {
      if (request === version.current)
        setError(
          "No pudimos cargar el catálogo. Verifica tu conexión y vuelve a intentar.",
        );
    } finally {
      if (request === version.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 50 * 60 * 1000);
    return () => {
      version.current++;
      clearInterval(timer);
    };
  }, [reload]);
  return { products, alerts, images, loading, error, warning, reload };
}
