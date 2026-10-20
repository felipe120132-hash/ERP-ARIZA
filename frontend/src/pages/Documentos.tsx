import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Cloud,
  FileText,
  Download,
  Upload,
  RefreshCw,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useAuth } from "@/context/AuthContext";
import {
  cerrarSesionOneDrive,
  configuracionOneDrive,
  estadoOneDrive,
  iniciarAutenticacionOneDrive,
} from "@/services/onedriveService";
import {
  documentosEmpresaService as service,
  tiposDocumento,
  solicitudDocumento,
  validarDocumento,
  evaluarProteccionDocumento,
  type MetadataDocumento,
  type SolicitudDocumento,
} from "@/services/documentosEmpresaService";
import type { Documento } from "@/types/schemas";

const message = (e: unknown) =>
  e instanceof Error ? e.message : "No pudimos completar la operación.";

export default function Documentos() {
  const { user, perfil } = useAuth();
  return (
    <CentroDocumental
      key={user!.id}
      userId={user!.id}
      admin={perfil?.rol === "ADMIN"}
    />
  );
}

function CentroDocumental({
  userId,
  admin,
}: {
  userId: string;
  admin: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const remisionFilter = params.get("remision") ?? undefined;
  const [connection, setConnection] = useState<{
    connected: boolean;
    account: string | null;
  } | null>(null);
  const [rows, setRows] = useState<Documento[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [tipoFilter, setTipoFilter] = useState("");
  const [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false),
    [disconnect, setDisconnect] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<Documento | null>(null),
    [deleteError, setDeleteError] = useState("");
  const [searchClient, setSearchClient] = useState(""),
    [searchRemision, setSearchRemision] = useState(""),
    [clients, setClients] = useState<
      Awaited<ReturnType<typeof service.clientes>>
    >([]),
    [remisiones, setRemisiones] = useState<
      Awaited<ReturnType<typeof service.remisiones>>
    >([]),
    [referenceError, setReferenceError] = useState("");
  const [nombre, setNombre] = useState(""),
    [tipo, setTipo] = useState<MetadataDocumento["tipo_documento"]>("OTRO"),
    [cliente, setCliente] = useState<string | null>(null),
    [remision, setRemision] = useState<string | null>(params.get("remision")),
    [principal, setPrincipal] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [review, setReview] = useState(false);
  const [pending, setPending] = useState<SolicitudDocumento | null>(null),
    [draftReady, setDraftReady] = useState(false);
  const lock = useRef(false),
    fileInput = useRef<HTMLInputElement>(null),
    draftKey = `documento:${userId}`;
  const config = configuracionOneDrive();

  useEffect(() => {
    if (remisionFilter) setRemision(remisionFilter);
  }, [remisionFilter]);

  useEffect(() => {
    let active = true;
    solicitudDocumento(draftKey, "read")
      .then((s) => {
        if (active) {
          setPending(s);
          setDraftReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [draftKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      Promise.all([
        service.listar({
          page,
          q: query,
          tipo: tipoFilter,
          remision_id: remisionFilter,
        }),
        estadoOneDrive(),
      ])
        .then(([list, c]) => {
          if (active) {
            setRows(list.documents);
            setTotal(list.total);
            setConnection(c);
          }
        })
        .catch((e) => {
          if (active) {
            setError(message(e));
            setRows([]);
            setConnection(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, query, tipoFilter, refresh, remisionFilter]);

  useEffect(() => {
    if (!admin) return;
    let active = true;
    const timer = setTimeout(() => {
      Promise.all([
        service.clientes(searchClient),
        service.remisiones(
          searchRemision,
          cliente,
          params.get("remision") ?? undefined,
        ),
      ])
        .then(([c, r]) => {
          if (active) {
            setClients(c);
            setRemisiones(r);
            setReferenceError("");
          }
        })
        .catch((e) => {
          if (active) setReferenceError(message(e));
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [admin, searchClient, searchRemision, cliente, params, refresh]);

  async function act(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await run();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  async function done(doc: Documento) {
    await solicitudDocumento(draftKey, "delete");
    setPending(null);
    setFile(null);
    setNombre("");
    setReview(false);
    setPrincipal(false);
    if (fileInput.current) fileInput.current.value = "";
    setSuccess(`Documento «${doc.nombre}» guardado en OneDrive.`);
    setRefresh((x) => x + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      if (!file) throw new Error("Selecciona un archivo.");
      await validarDocumento(file);
      if (!nombre.trim())
        throw new Error("Escribe un nombre para el documento.");
      if (principal && (!remision || file.type !== "application/pdf"))
        throw new Error(
          "Selecciona una remisión y un PDF para guardar el documento principal.",
        );
      if (!review) {
        setReview(true);
        return;
      }
      const request: SolicitudDocumento = {
        key: draftKey,
        file,
        metadata: {
          id: crypto.randomUUID(),
          nombre: nombre.trim(),
          tipo_documento: tipo,
          cliente_id:
            remisiones.find((r) => r.id === remision)?.cliente_id ?? cliente,
          remision_id: remision,
          pdf_remision: principal,
        },
      };
      await solicitudDocumento(draftKey, "save", request);
      setPending(request);
      await done(await service.subir(request));
    });
  }

  async function generate() {
    await act(async () => {
      if (!remision) throw new Error("Selecciona una remisión.");
      const [{ cargarDocumentoRemision }, { generarRemisionPdf }] =
        await Promise.all([
          import("@/services/documentoRemisionService"),
          import("@/lib/remisionPdf"),
        ]);
      const data = await cargarDocumentoRemision(remision);
      const pdf = await generarRemisionPdf(data);
      const fileName = `remision-${data.remision.consecutivo}${data.remision.estado === "ANULADA" ? "-anulada" : ""}.pdf`;
      setFile(
        new File([pdf.output("blob")], fileName, { type: "application/pdf" }),
      );
      setNombre(
        `Remisión #${data.remision.consecutivo}${data.remision.estado === "ANULADA" ? " (Anulada)" : ""}`,
      );
      setCliente(data.remision.cliente_id);
      setRemision(data.remision.id);
      setTipo("OTRO");
      setPrincipal(true);
      setReview(true);
    });
  }

  async function confirmDelete() {
    if (!deletingDoc || lock.current) return;
    lock.current = true;
    setBusy(true);
    setDeleteError("");
    setError("");
    setSuccess("");
    try {
      await service.eliminar(deletingDoc);
      const deletedName = deletingDoc.nombre;
      setDeletingDoc(null);
      setSuccess(`Documento «${deletedName}» eliminado de OneDrive.`);
      setRefresh((x) => x + 1);
    } catch (e) {
      setDeleteError(message(e));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  function focusUploader() {
    const uploader = document.getElementById("document-upload-panel");
    uploader?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    const nameInput = document.getElementById(
      "document-name",
    ) as HTMLInputElement | null;
    nameInput?.focus();
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ARIZA ONE / DOCUMENTOS</span>
          <h1>El archivo de tu operación.</h1>
          <p>
            Remisiones, soportes y acuerdos, reunidos en el OneDrive de la
            empresa.
          </p>
        </div>
        <div className="order-actions">
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => setRefresh((x) => x + 1)}
          >
            <RefreshCw size={16} />
            Actualizar
          </Button>
          {admin && (
            <Button type="button" disabled={busy} onClick={focusUploader}>
              <Upload size={16} />
              Subir documento
            </Button>
          )}
        </div>
      </div>

      <section className="document-connection">
        <div className="document-cloud">
          <Cloud size={28} />
        </div>
        <div>
          <span className="eyebrow">CUENTA EMPRESARIAL</span>
          <h2>
            {connection?.connected
              ? "OneDrive conectado"
              : connection
                ? "Conecta el archivo de la empresa"
                : "Verificando conexión…"}
          </h2>
          <p>
            {connection?.connected
              ? (connection.account ??
                "Disponible para el equipo. Los permisos se verifican al abrir cada documento.")
              : "Un administrador debe autorizar la cuenta Microsoft de la empresa."}
          </p>
        </div>
        {admin && connection && (
          <div className="receipt-tools">
            {connection.connected ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDisconnect(true)}
              >
                Desconectar cuenta
              </Button>
            ) : (
              <Button
                disabled={busy || !!config.error}
                onClick={() =>
                  void act(() => iniciarAutenticacionOneDrive(userId))
                }
              >
                Conectar OneDrive
              </Button>
            )}
          </div>
        )}
      </section>

      {admin && !connection?.connected && config.error && (
        <p className="warning-box">{config.error}</p>
      )}

      {disconnect && (
        <section className="warning-box">
          <p>
            Desconectar impedirá al equipo subir y descargar documentos hasta
            que un administrador reconecte la misma cuenta. Los archivos no se
            borrarán ni se revocará el permiso en Microsoft.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await cerrarSesionOneDrive();
                setDisconnect(false);
                setRefresh((x) => x + 1);
              })
            }
          >
            Confirmar desconexión
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => setDisconnect(false)}
          >
            Cancelar
          </Button>
        </section>
      )}

      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="order-success" role="status">
          {success}
        </p>
      )}

      {remisionFilter && (
        <p className="warning-box">
          Mostrando documentos de la remisión seleccionada.{" "}
          <Button
            variant="ghost"
            onClick={() => {
              setParams({});
              setPage(1);
            }}
          >
            Ver todos los documentos
          </Button>
        </p>
      )}

      <div className={`document-layout ${admin ? "" : "document-readonly"}`}>
        <section className="catalog-panel document-library">
          <div className="document-section-heading">
            <FileText size={22} />
            <div>
              <h2>Documentos guardados</h2>
              <p>{total} documentos registrados</p>
            </div>
          </div>
          <div className="document-filters">
            <Input
              aria-label="Buscar documentos"
              placeholder="Buscar por nombre…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
            <select
              aria-label="Filtrar tipo de documento"
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos los tipos</option>
              {Object.entries(tiposDocumento).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="empty-state" role="status">
              Consultando documentos…
            </p>
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <FileText />
              <h3>
                {error
                  ? "No pudimos consultar el archivo"
                  : "No hay documentos para mostrar"}
              </h3>
              <p>
                {error
                  ? "Actualiza para volver a consultar."
                  : query || tipoFilter
                    ? "No encontramos documentos con los filtros actuales. Cambia la búsqueda o sube un nuevo soporte."
                    : "Sube un archivo o cambia los filtros."}
              </p>
              {(query || tipoFilter) && !error && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setTipoFilter("");
                    setPage(1);
                  }}
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="document-list">
              {rows.map((doc) => {
                const proteccion = evaluarProteccionDocumento(doc);
                return (
                  <article className="document-row" key={doc.id}>
                    <div className="document-file-icon">
                      <FileText size={24} />
                    </div>
                    <div className="document-row-info">
                      <div className="document-row-badges">
                        <span className="eyebrow">
                          {tiposDocumento[doc.tipo_documento]}
                        </span>
                        {proteccion.protegido && (
                          <span
                            className="document-protected-badge"
                            title={proteccion.motivo ?? undefined}
                          >
                            <ShieldCheck size={12} />
                            Protegido
                          </span>
                        )}
                      </div>
                      <h3>{doc.nombre}</h3>
                      <small>
                        {doc.created_at.toLocaleDateString("es-CO")} ·{" "}
                        {doc.remision_id
                          ? "Asociado a remisión"
                          : doc.cliente_id
                            ? "Asociado a cliente"
                            : "Archivo general"}
                      </small>
                      <div>
                        {doc.remision_id && (
                          <Link to={`/remisiones/${doc.remision_id}`}>
                            Ver remisión
                          </Link>
                        )}
                        {doc.cliente_id && (
                          <Link to={`/cartera/${doc.cliente_id}`}>
                            Ver cliente
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="document-row-actions">
                      <Button
                        variant="outline"
                        disabled={busy || !connection?.connected}
                        onClick={() =>
                          void act(() => service.descargar(doc.id, doc.nombre))
                        }
                        aria-label={`Descargar ${doc.nombre}`}
                      >
                        <Download size={16} />
                        <span>Descargar</span>
                      </Button>
                      {admin && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !connection?.connected}
                          onClick={() => {
                            setDeletingDoc(doc);
                            setDeleteError("");
                          }}
                          aria-label={`Eliminar ${doc.nombre}`}
                        >
                          <Trash2 size={16} />
                          <span>Eliminar</span>
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="catalog-pagination">
            <Button
              variant="outline"
              disabled={page === 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>
              {page} / {Math.max(1, Math.ceil(total / 20))}
            </span>
            <Button
              variant="outline"
              disabled={page * 20 >= total || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </section>

        {admin && (
          <section
            id="document-upload-panel"
            className="catalog-panel document-uploader"
          >
            <span className="eyebrow">INCORPORAR AL ARCHIVO</span>
            <h2>Nuevo documento</h2>
            <p>PDF, JPG o PNG · Hasta 5 MB</p>
            {pending ? (
              <div className="warning-box" role="status">
                <h3>Subida pendiente de confirmar</h3>
                <p>
                  {pending.metadata.nombre} · {pending.file.name}
                </p>
                <p>
                  Conservamos el archivo original y su solicitud. Consulta el
                  resultado o reintenta sin crear otro documento.
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const doc = await service.recuperar(pending.metadata.id);
                      if (doc) await done(doc);
                      else
                        setSuccess(
                          "Todavía no está confirmado. Reintenta la misma subida.",
                        );
                    })
                  }
                >
                  Consultar resultado
                </Button>
                <Button
                  disabled={busy || !connection?.connected}
                  onClick={() =>
                    void act(async () => done(await service.subir(pending)))
                  }
                >
                  Reintentar misma subida
                </Button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <fieldset
                  disabled={busy || !draftReady || !connection?.connected}
                >
                  <div className="document-file-picker">
                    <Upload size={26} />
                    <Label htmlFor="document-file">Seleccionar archivo</Label>
                    <Input
                      ref={fileInput}
                      id="document-file"
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setReview(false);
                      }}
                    />
                    <small>
                      {file
                        ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB`
                        : "Selecciona un archivo o prepara el PDF de una remisión."}
                    </small>
                  </div>
                  <div>
                    <Label htmlFor="document-name">Nombre del documento</Label>
                    <Input
                      id="document-name"
                      value={nombre}
                      maxLength={160}
                      required
                      onChange={(e) => {
                        setNombre(e.target.value);
                        setReview(false);
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="document-type">Tipo de documento</Label>
                    <select
                      id="document-type"
                      value={tipo}
                      onChange={(e) => {
                        setTipo(e.target.value as typeof tipo);
                        setReview(false);
                      }}
                    >
                      {Object.entries(tiposDocumento).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="document-client-search">
                      Buscar cliente (opcional)
                    </Label>
                    <Input
                      id="document-client-search"
                      value={searchClient}
                      onChange={(e) => setSearchClient(e.target.value)}
                      placeholder="Nombre de la tienda…"
                    />
                    <select
                      aria-label="Cliente del documento"
                      value={cliente ?? ""}
                      onChange={(e) => {
                        setCliente(e.target.value || null);
                        setRemision(null);
                        setPrincipal(false);
                        setReview(false);
                      }}
                    >
                      <option value="">Sin cliente</option>
                      {cliente && !clients.some((c) => c.id === cliente) && (
                        <option value={cliente}>
                          Cliente de la remisión seleccionada
                        </option>
                      )}
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre_tienda}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="document-receipt-search">
                      Buscar remisión por número (opcional)
                    </Label>
                    <Input
                      id="document-receipt-search"
                      value={searchRemision}
                      onChange={(e) => setSearchRemision(e.target.value)}
                      placeholder="Últimas 50 remisiones"
                    />
                    <select
                      aria-label="Remisión del documento"
                      value={remision ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setRemision(val);
                        const found = remisiones.find((r) => r.id === val);
                        if (found) setCliente(found.cliente_id);
                        setPrincipal(false);
                        setReview(false);
                      }}
                    >
                      <option value="">Sin remisión</option>
                      {remision &&
                        !remisiones.some((r) => r.id === remision) && (
                          <option value={remision}>
                            Remisión seleccionada
                          </option>
                        )}
                      {remisiones.map((r) => (
                        <option key={r.id} value={r.id}>
                          Remisión #{r.consecutivo}
                        </option>
                      ))}
                    </select>
                  </div>
                  {referenceError && (
                    <p className="error-box">{referenceError}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!remision}
                    onClick={() => void generate()}
                  >
                    Preparar PDF de remisión
                  </Button>
                  <label className="finance-check">
                    <input
                      type="checkbox"
                      checked={principal}
                      disabled={!remision || file?.type !== "application/pdf"}
                      onChange={(e) => {
                        setPrincipal(e.target.checked);
                        setReview(false);
                      }}
                    />
                    Guardar como PDF principal de la remisión
                  </label>
                  {review && (
                    <div className="client-review">
                      <h3>Revisar documento</h3>
                      <p>
                        {nombre} · {tiposDocumento[tipo]}
                      </p>
                      <p>{file?.name}</p>
                      <p>
                        {remision
                          ? "Se asociará a la remisión seleccionada."
                          : cliente
                            ? "Se asociará al cliente seleccionado."
                            : "Se guardará como archivo general."}
                      </p>
                      {principal && (
                        <p>
                          Se actualizará el enlace del PDF principal de la
                          remisión. Los documentos anteriores se conservan.
                        </p>
                      )}
                    </div>
                  )}
                  <Button type="submit">
                    <Upload size={16} />
                    {busy
                      ? "Guardando…"
                      : review
                        ? "Confirmar y subir"
                        : "Revisar documento"}
                  </Button>
                </fieldset>
              </form>
            )}
          </section>
        )}
      </div>

      {deletingDoc && (
        <Sheet
          open
          onOpenChange={(v) => {
            if (!v && !busy) {
              setDeletingDoc(null);
              setDeleteError("");
            }
          }}
        >
          <SheetContent
            className="abono-sheet"
            showCloseButton={!busy}
            onEscapeKeyDown={(e) => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (busy) e.preventDefault();
            }}
          >
            <SheetHeader>
              <SheetDescription>DOCUMENTOS / ELIMINAR ARCHIVO</SheetDescription>
              <SheetTitle>Eliminar documento</SheetTitle>
            </SheetHeader>
            <div className="abono-body">
              {deleteError && (
                <p className="error-box" role="alert">
                  {deleteError}
                </p>
              )}
              <div className="finance-form">
                <div className="finance-review">
                  <span className="eyebrow">
                    {tiposDocumento[deletingDoc.tipo_documento]}
                  </span>
                  <h2>{deletingDoc.nombre}</h2>
                  <p>
                    {deletingDoc.created_at.toLocaleDateString("es-CO")} ·{" "}
                    {deletingDoc.remision_id
                      ? "Asociado a remisión"
                      : deletingDoc.cliente_id
                        ? "Asociado a cliente"
                        : "Archivo general"}
                  </p>
                  <p>
                    ¿Confirmas la eliminación de este documento? Se borrará el
                    archivo en Microsoft OneDrive y su registro en el ERP.
                  </p>
                </div>
                <div className="order-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setDeletingDoc(null);
                      setDeleteError("");
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void confirmDelete()}
                  >
                    {busy ? "Eliminando…" : "Confirmar eliminación"}
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
