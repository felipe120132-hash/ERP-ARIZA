import { z } from "zod";
import { supabase } from "./supabaseClient";

const prefix = "ariza:onedrive:";
const pendingKey = `${prefix}pending`;
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), expires_in: z.number().positive().finite(), token_type: z.string().regex(/^bearer$/i) });
const pendingSchema = z.object({ state: z.string().min(32), userId: z.string(), createdAt: z.number(), redirectUri: z.string() });
const storedSchema = tokenSchema.extend({ expiresAt: z.number() });
let generation = 0;
const exchanges = new Map<string, Promise<void>>();

export function configuracionOneDrive(): { error: string | null; clientId: string; redirectUri: string } {
  const clientId = import.meta.env.VITE_ONEDRIVE_CLIENT_ID?.trim() ?? "";
  const redirectUri = import.meta.env.VITE_ONEDRIVE_REDIRECT_URI?.trim() ?? "";
  if (!clientId || !redirectUri) return { clientId, redirectUri, error: "Falta configurar la conexión con Microsoft. Contacta al administrador." };
  try {
    const uri = new URL(redirectUri);
    if (uri.origin !== location.origin || uri.pathname !== "/onedrive/callback" || uri.search || uri.hash || uri.username || uri.password || (uri.protocol !== "https:" && !(uri.protocol === "http:" && ["localhost", "127.0.0.1"].includes(uri.hostname)))) throw new Error();
    return { clientId, redirectUri, error: null };
  } catch { return { clientId, redirectUri, error: "La dirección de retorno de Microsoft no corresponde a esta aplicación. Contacta al administrador." }; }
}

export function cerrarSesionOneDrive(): void {
  generation++;
  exchanges.clear();
  for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
  for (const key of ["onedrive_access_token", "onedrive_refresh_token", "onedrive_expires_at"]) localStorage.removeItem(key);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") cerrarSesionOneDrive();
});

function stored(userId: string) {
  try { return storedSchema.parse(JSON.parse(sessionStorage.getItem(`${prefix}${userId}`) ?? "null")); }
  catch { return null; }
}
export function tieneConexionOneDrive(userId: string): boolean { return stored(userId) !== null; }

async function sessionFor(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) throw new Error("Tu sesión cambió. Vuelve a conectar OneDrive desde Documentos.");
  return data.session;
}

export async function iniciarAutenticacionOneDrive(userId: string): Promise<void> {
  const config = configuracionOneDrive();
  if (config.error) throw new Error(config.error);
  await sessionFor(userId);
  cerrarSesionOneDrive();
  const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
  sessionStorage.setItem(pendingKey, JSON.stringify({ state, userId, createdAt: Date.now(), redirectUri: config.redirectUri }));
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", response_mode: "query", scope: "Files.ReadWrite offline_access User.Read", state });
  location.assign(`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`);
}

async function exchange(endpoint: string, body: object, userId: string) {
  const version = generation;
  const session = await sessionFor(userId);
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("Microsoft no pudo completar la conexión. Vuelve a iniciarla desde Documentos.");
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("El servidor no devolvió una sesión válida de OneDrive.");
  await sessionFor(userId);
  if (version !== generation) throw new Error("La conexión fue cancelada. Vuelve a iniciarla desde Documentos.");
  sessionStorage.setItem(`${prefix}${userId}`, JSON.stringify({ ...parsed.data, expiresAt: Date.now() + parsed.data.expires_in * 1000 }));
  return parsed.data.access_token;
}

// Cache the in-flight result for StrictMode; consume state before the one-use code is sent.
export function completarAutenticacionOneDrive(query: string, userId: string): Promise<void> {
  const key = `${userId}:${query}`;
  const existing = exchanges.get(key);
  if (existing) return existing;
  const result = (async () => {
    const params = new URLSearchParams(query);
    const config = configuracionOneDrive();
    if (config.error) throw new Error(config.error);
    let pending;
    try { pending = pendingSchema.parse(JSON.parse(sessionStorage.getItem(pendingKey) ?? "null")); } catch { throw new Error("Esta conexión ya se utilizó o no se inició en esta pestaña. Iníciala desde Documentos."); }
    if (params.getAll("state").length !== 1 || params.get("state") !== pending.state || pending.userId !== userId || pending.redirectUri !== config.redirectUri || Date.now() - pending.createdAt > 600000 || pending.createdAt > Date.now()) throw new Error("No pudimos validar esta conexión. Vuelve a iniciarla desde Documentos.");
    sessionStorage.removeItem(pendingKey);
    if (params.has("error")) throw new Error(params.get("error") === "access_denied" ? "Cancelaste la autorización de Microsoft. Puedes conectar OneDrive cuando lo necesites." : "Microsoft rechazó la autorización. Vuelve a iniciarla desde Documentos.");
    const code = params.get("code");
    if (!code || params.getAll("code").length !== 1) throw new Error("Microsoft no devolvió un código válido. Vuelve a iniciar la conexión.");
    try { await exchange("onedrive-auth", { code, redirect_uri: config.redirectUri }, userId); }
    catch (error) { if (error instanceof TypeError || (error instanceof DOMException)) throw new Error("No pudimos confirmar la conexión. Inicia una nueva autorización desde Documentos."); throw error; }
  })();
  exchanges.set(key, result);
  return result;
}

export async function subirArchivoOneDrive(path: string, file: File | Blob) {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const tokens = userId ? stored(userId) : null;
    if (!userId || !tokens) throw new Error("Conecta OneDrive desde Documentos.");
    const accessToken = tokens.expiresAt > Date.now() + 60000 ? tokens.access_token : await exchange("onedrive-refresh", { refresh_token: tokens.refresh_token }, userId);
    const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${path.split("/").map(encodeURIComponent).join("/")}:/content`, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": file.type || "application/octet-stream" }, body: file });
    if (!response.ok) throw new Error("No se pudo subir el archivo a OneDrive.");
    const json = z.object({ webUrl: z.string().url(), name: z.string(), size: z.number() }).parse(await response.json());
    return { data: { url: json.webUrl, nombre: json.name, tamano: json.size }, error: null };
  } catch { return { data: null, error: "No se pudo completar la subida. Comprueba la conexión con OneDrive." }; }
}
