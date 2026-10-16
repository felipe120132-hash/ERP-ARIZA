import { z } from "zod";
import { supabase } from "./supabaseClient";
const pendingKey="ariza:onedrive:oauth";
const exchanges=new Map<string,Promise<void>>();
export async function onedriveRequest(body: object | FormData, binary=false) {
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw new Error("Inicia sesión en el ERP.");
  let response: Response;
  try { response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onedrive`,{method:"POST",headers:{Authorization:`Bearer ${data.session.access_token}`,apikey:import.meta.env.VITE_SUPABASE_ANON_KEY,...(body instanceof FormData?{}:{"Content-Type":"application/json"})},body:body instanceof FormData?body:JSON.stringify(body),signal:AbortSignal.timeout(115000)}); }
  catch {throw new Error("No pudimos confirmar la operación. Conserva la solicitud y vuelve a intentar.");}
  if(!response.ok){
    if(response.status===404)throw new Error("El módulo documental aún no está desplegado en el servidor. Contacta al administrador.");
    const json=await response.json().catch(()=>null);
    throw new Error(typeof json?.error==="string"?json.error:"No se pudo completar la operación de documentos.");
  }
  return binary?response.blob():response.json();
}
// Remove credentials left by the old browser-token implementation. Never migrate them.
export function limpiarCredencialesAnteriores() {
  for(const key of Object.keys(sessionStorage))if(key.startsWith("ariza:onedrive:")&&key!==pendingKey)sessionStorage.removeItem(key);
  for(const key of ["onedrive_access_token","onedrive_refresh_token","onedrive_expires_at"])localStorage.removeItem(key);
}
export function configuracionOneDrive(){
  const redirectUri=import.meta.env.VITE_ONEDRIVE_REDIRECT_URI?.trim()??"";
  try {const u=new URL(redirectUri);if(u.origin!==location.origin||u.pathname!=="/onedrive/callback"||u.search||u.hash)throw new Error();return {redirectUri,error:null};}
  catch{return {redirectUri,error:"La dirección de retorno de Microsoft no corresponde a esta aplicación. Contacta al administrador."};}
}
export async function estadoOneDrive(){limpiarCredencialesAnteriores();return z.object({connected:z.boolean(),account:z.string().nullable()}).parse(await onedriveRequest({action:"status"}));}
export async function cerrarSesionOneDrive(){await onedriveRequest({action:"disconnect"});sessionStorage.removeItem(pendingKey);exchanges.clear();limpiarCredencialesAnteriores();}
export async function iniciarAutenticacionOneDrive(userId:string){
  limpiarCredencialesAnteriores(); const c=configuracionOneDrive();if(c.error)throw new Error(c.error);
  const r=z.object({state:z.string().min(32),authorization_url:z.string().url()}).parse(await onedriveRequest({action:"start",redirect_uri:c.redirectUri}));
  const url=new URL(r.authorization_url);
  if(url.origin!=="https://login.microsoftonline.com"||url.pathname!=="/consumers/oauth2/v2.0/authorize"||url.searchParams.get("state")!==r.state||url.searchParams.get("redirect_uri")!==c.redirectUri)throw new Error("La dirección de autorización recibida no es válida.");
  sessionStorage.setItem(pendingKey,JSON.stringify({state:r.state,userId,createdAt:Date.now(),redirectUri:c.redirectUri}));
  location.assign(url.href);
}
export function completarAutenticacionOneDrive(query:string,userId:string):Promise<void>{
  const key=`${userId}:${query}`,existing=exchanges.get(key);if(existing)return existing;
  const promise=(async()=>{
    const p=new URLSearchParams(query), c=configuracionOneDrive();if(c.error)throw new Error(c.error);
    let saved;
    try {saved=z.object({state:z.string(),userId:z.string(),createdAt:z.number(),redirectUri:z.string()}).parse(JSON.parse(sessionStorage.getItem(pendingKey)??"null"));}
    catch{throw new Error("Esta autorización no se inició en esta pestaña o ya se utilizó. Vuelve a conectar desde Documentos.");}
    if(p.getAll("state").length!==1||p.get("state")!==saved.state||saved.userId!==userId||saved.redirectUri!==c.redirectUri||Date.now()-saved.createdAt>600000||saved.createdAt>Date.now())throw new Error("No pudimos validar esta autorización. Vuelve a conectar desde Documentos.");
    sessionStorage.removeItem(pendingKey);
    if(p.has("error"))throw new Error(p.get("error")==="access_denied"?"Cancelaste la autorización de Microsoft.":"Microsoft rechazó la autorización.");
    if(p.getAll("code").length!==1||!p.get("code"))throw new Error("Microsoft no devolvió un código válido.");
    z.object({connected:z.literal(true)}).parse(await onedriveRequest({action:"complete",code:p.get("code"),state:saved.state,redirect_uri:c.redirectUri}));
  })();exchanges.set(key,promise);return promise;
}
