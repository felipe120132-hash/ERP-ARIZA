import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { obtenerImagenes } from "@/services/imagenesService";
import { validarFotoProducto } from "@/services/productosAdminService";
import type { Producto } from "@/types/schemas";
export default function ProductoFoto({
  producto,
  disabled,
  guardar,
}: {
  producto: Producto;
  disabled: boolean;
  guardar: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState(false),
    [checking, setChecking] = useState(false),
    [attempt, setAttempt] = useState(0);
  const version = useRef(0),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    setUrl("");
    setError("");
    if (producto.imagen_path)
      obtenerImagenes([producto.imagen_path])
        .then((urls) => {
          if (live) {
            setUrl(urls[producto.imagen_path!] ?? "");
            if (!urls[producto.imagen_path!])
              setError(
                "No pudimos abrir la foto actual. Puedes volver a consultarla.",
              );
          }
        })
        .catch(() => {
          if (live) setError("No pudimos abrir la foto actual.");
        });
    return () => {
      live = false;
    };
  }, [producto.imagen_path, attempt]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const value = URL.createObjectURL(file);
    setPreview(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  useEffect(() => {
    version.current++;
    setChecking(false);
    setFile(null);
    setReview(false);
    if (input.current) input.current.value = "";
  }, [producto.imagen_path]);
  useEffect(
    () => () => {
      version.current++;
    },
    [],
  );
  async function choose(next?: File) {
    const request = ++version.current;
    setFile(null);
    setReview(false);
    setError("");
    if (!next) {
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      await validarFotoProducto(next);
      if (request === version.current) setFile(next);
    } catch (e) {
      if (request === version.current)
        setError(e instanceof Error ? e.message : "Imagen no válida.");
    } finally {
      if (request === version.current) setChecking(false);
    }
  }
  return (
    <section className="catalog-panel product-photo-editor">
      <span className="eyebrow">IMAGEN DEL CATÁLOGO</span>
      <h2>Una foto que lo represente.</h2>
      <div className="product-photo-preview">
        {preview || url ? (
          <img
            src={preview || url}
            alt={
              preview
                ? "Vista previa de la nueva foto"
                : `Foto de ${producto.nombre}`
            }
            onError={() =>
              setError(
                "No se pudo mostrar la imagen. Vuelve a consultar la foto.",
              )
            }
          />
        ) : (
          <>
            <ImagePlus size={40} />
            <span>Sin foto disponible</span>
          </>
        )}
      </div>
      <p>JPG, PNG o WebP · máximo 5 MB.</p>
      <label htmlFor="foto-producto">Seleccionar foto</label>
      <input
        ref={input}
        id="foto-producto"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || checking}
        onChange={(e) => void choose(e.target.files?.[0])}
      />
      {checking && <p role="status">Comprobando imagen…</p>}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {file && (
        <>
          <p>
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
          {review && (
            <p className="warning-box">
              Al confirmar, esta será la foto visible en el catálogo.
            </p>
          )}
          <Button
            disabled={disabled || checking}
            onClick={async () => {
              if (!review) {
                setReview(true);
                return;
              }
              await guardar(file);
            }}
          >
            {review ? "Confirmar foto" : "Revisar foto"}
          </Button>
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              void choose();
              if (input.current) input.current.value = "";
            }}
          >
            Descartar selección
          </Button>
        </>
      )}
      {producto.imagen_path && (
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => setAttempt((x) => x + 1)}
        >
          Volver a consultar foto
        </Button>
      )}
    </section>
  );
}
