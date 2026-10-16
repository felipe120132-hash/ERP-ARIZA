import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@4.0.0";

const origins = new Set(["https://erp-ariza.vercel.app", "http://localhost:5173"]);
const redirects = new Set([...origins].map(origin => `${origin}/onedrive/callback`));
const maximum = 5 * 1024 * 1024;
const uuid = z.string().uuid();
const metadataSchema = z.object({
  id: uuid, nombre: z.string().trim().min(1).max(160),
  tipo_documento: z.enum(["FACTURA_DIAN", "COTIZACION_CHINA", "LEGAL", "OTRO"]),
  cliente_id: uuid.nullable(), remision_id: uuid.nullable(), pdf_remision: z.boolean(),
});
class PublicError extends Error { constructor(message: string, public status = 400) { super(message); } }
function env(name: string) { const value = Deno.env.get(name); if (!value) throw new PublicError("La integración aún no está configurada en el servidor.", 503); return value; }
function requireOk<T>(result: { data: T; error: unknown }): T { if (result.error) throw new PublicError("No se pudo confirmar la operación. Reintenta la misma solicitud.", 503); return result.data; }
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), x => x.charCodeAt(0));
async function hash(text: string | Uint8Array) { const bytes = typeof text === "string" ? new TextEncoder().encode(text) : new Uint8Array(text); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(x => x.toString(16).padStart(2,"0")).join(""); }
async function key() { const bytes = unb64(env("ONEDRIVE_ENCRYPTION_KEY")); if (bytes.length !== 32) throw new PublicError("La clave de cifrado del servidor no es válida.", 503); return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt","decrypt"]); }
async function seal(value: unknown) { const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name:"AES-GCM",iv }, await key(),new TextEncoder().encode(JSON.stringify(value))); return `${b64(iv)}.${b64(new Uint8Array(cipher))}`; }
async function unseal(value: string) { const [iv,cipher] = value.split("."); const plain = await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(iv)},await key(),unb64(cipher)); return JSON.parse(new TextDecoder().decode(plain)); }
async function microsoftToken(params: Record<string,string>) {
  const response = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", { method:"POST", body:new URLSearchParams({client_id:env("CLIENT_ID"),client_secret:env("CLIENT_SECRET"),scope:"Files.ReadWrite offline_access User.Read",...params}),signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw new PublicError("Microsoft no pudo renovar o completar la autorización. Un administrador debe volver a conectar la cuenta.", 409);
  return z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive()}).parse(await response.json());
}
async function graph(token: string, path: string, options: RequestInit = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {...options, headers:{...options.headers,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  return response;
}
async function limitedBody(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if(!stream)throw new PublicError("Solicitud vacía.");
  const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new PublicError("El archivo supera el tamaño permitido.",413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

export async function handleRequest(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const headers = {"Access-Control-Allow-Origin":origins.has(origin)?origin:"https://erp-ariza.vercel.app","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Expose-Headers":"Content-Disposition","Vary":"Origin","Cache-Control":"no-store"};
  const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json"}});
  if (origin && !origins.has(origin)) return json({error:"Origen no permitido."},403);
  if(req.method === "OPTIONS") return new Response(null,{headers});
  if(req.method !== "POST") return json({error:"Método no permitido."},405);
  let db: SupabaseClient | undefined;
  let lease: string | undefined;
  try {
    db=createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
    const bearer=req.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
    if(!bearer) throw new PublicError("Inicia sesión en el ERP.",401);
    const auth=await db.auth.getUser(bearer);
    if(auth.error || !auth.data.user) throw new PublicError("Tu sesión expiró.",401);
    const user=auth.data.user;
    const profile=requireOk(await db.from("perfiles").select("rol,activo").eq("id",user.id).single());
    if(!profile?.activo || !["ADMIN","VENDEDOR"].includes(profile.rol)) throw new PublicError("Tu cuenta no tiene acceso.",403);
    const isForm=req.headers.get("Content-Type")?.startsWith("multipart/form-data");
    if(Number(req.headers.get("Content-Length")??0)>maximum+65536) throw new PublicError("El archivo supera 5 MB.",413);
    const received=await limitedBody(req.body,isForm?maximum+65536:32768);
    const form=isForm?await new Response(received,{headers:{"Content-Type":req.headers.get("Content-Type")!}}).formData():null;
    const body=form?{action:"upload"}:JSON.parse(new TextDecoder().decode(received));
    const admin=["start","complete","disconnect","upload","recover"].includes(body.action);
    if(admin && profile.rol!=="ADMIN") throw new PublicError("Solo administradores activos pueden realizar esta operación.",403);
    const connection=()=>db!.from("onedrive_empresa").select("*").eq("id",true).single();
    if(body.action==="status") { const c=requireOk(await connection()); return json({connected:!!c.tokens_cifrados,account:profile.rol==="ADMIN"?c.cuenta:null}); }
    if(body.action==="list") {
      const page=z.number().int().min(1).max(100000).parse(body.page??1);
      let q=db.from("documentos").select("*",{count:"exact"}).order("created_at",{ascending:false}).order("id");
      if(body.tipo) q=q.eq("tipo_documento",metadataSchema.shape.tipo_documento.parse(body.tipo));
      if(body.cliente_id) q=q.eq("cliente_id",uuid.parse(body.cliente_id));
      if(body.remision_id) q=q.eq("remision_id",uuid.parse(body.remision_id));
      if(body.q) q=q.ilike("nombre",`%${z.string().max(160).parse(body.q).replace(/[%_\\]/g,"\\$&")}%`);
      const r=await q.range((page-1)*20,page*20-1); requireOk(r); return json({documents:r.data,total:r.count});
    }
    if(body.action==="references") {
      const search=z.string().max(100).parse(body.q??"");
      if(body.kind==="clientes") { let q=db.from("clientes").select("id,nombre_tienda").order("nombre_tienda").limit(50); if(search)q=q.ilike("nombre_tienda",`%${search.replace(/[%_\\]/g,"\\$&")}%`); return json({items:requireOk(await q)}); }
      let q=db.from("remisiones").select("id,consecutivo,cliente_id").order("created_at",{ascending:false}).limit(50);
      if(body.id)q=q.eq("id",uuid.parse(body.id));
      if(body.cliente_id)q=q.eq("cliente_id",uuid.parse(body.cliente_id));
      if(search){ if(!/^\d+$/.test(search))return json({items:[]}); q=q.eq("consecutivo",search); }
      return json({items:requireOk(await q)});
    }
    if(body.action==="start") {
      if(!redirects.has(body.redirect_uri))throw new PublicError("Dirección de retorno no autorizada.");
      const state=crypto.randomUUID()+crypto.randomUUID(), verifier=b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      const challenge=b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier)))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      requireOk(await db.from("onedrive_oauth").delete().eq("usuario_id",user.id));
      requireOk(await db.from("onedrive_oauth").insert({state_hash:await hash(state),usuario_id:user.id,redirect_uri:body.redirect_uri,verifier_cifrado:await seal(verifier),expires_at:new Date(Date.now()+600000).toISOString()}));
      const params=new URLSearchParams({client_id:env("CLIENT_ID"),redirect_uri:body.redirect_uri,response_type:"code",response_mode:"query",scope:"Files.ReadWrite offline_access User.Read",state,code_challenge:challenge,code_challenge_method:"S256",prompt:"select_account"});
      return json({state,authorization_url:`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`});
    }
    if(body.action==="recover") {
      const id=uuid.parse(body.id);
      const a=requireOk(await db.from("onedrive_archivos").select("finalizado,usuario_id").eq("id",id).maybeSingle());
      if(a && a.usuario_id!==user.id)throw new PublicError("La solicitud pertenece a otro usuario.",403);
      if(a?.finalizado)return json({document:requireOk(await db.from("documentos").select("*").eq("id",id).single())});
      return json({document:null});
    }
    // Serialize token renewal, connection changes and file writes across Edge instances.
    lease=crypto.randomUUID();
    if(!requireOk(await db.rpc("onedrive_lock",{p_owner:lease}))) {lease=undefined;throw new PublicError("OneDrive está procesando otra solicitud. Reintenta en unos segundos.",409);}
    let c=requireOk(await connection());
    if(body.action==="disconnect") {requireOk(await db.from("onedrive_empresa").update({tokens_cifrados:null,expires_at:null,cuenta:null}).eq("id",true).eq("lock_owner",lease));return json({ok:true});}
    if(body.action==="complete") {
      const state=z.string().min(32).max(200).parse(body.state),code=z.string().min(1).max(10000).parse(body.code);
      const oauth=requireOk(await db.from("onedrive_oauth").delete().eq("state_hash",await hash(state)).eq("usuario_id",user.id).eq("redirect_uri",body.redirect_uri).gt("expires_at",new Date().toISOString()).select("*").maybeSingle());
      if(!oauth)throw new PublicError("La autorización venció o ya se utilizó. Inicia una conexión nueva.");
      const tokens=await microsoftToken({grant_type:"authorization_code",code,redirect_uri:oauth.redirect_uri,code_verifier:await unseal(oauth.verifier_cifrado)});
      const driveResponse=await graph(tokens.access_token,"/me/drive");
      if(!driveResponse.ok)throw new PublicError("No se pudo verificar el OneDrive de la cuenta.",409);
      const drive=await driveResponse.json();
      if(typeof drive.id!=="string")throw new PublicError("OneDrive devolvió una cuenta inválida.",502);
      if(c.drive_id && c.drive_id!==drive.id)throw new PublicError("Esta empresa ya tiene otra cuenta de OneDrive asociada. Reconecta la misma cuenta para conservar acceso a sus documentos.",409);
      requireOk(await db.from("onedrive_empresa").update({tokens_cifrados:await seal(tokens),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),drive_id:drive.id,cuenta:drive.owner?.user?.displayName??"Cuenta empresarial",conectado_por:user.id}).eq("id",true).eq("lock_owner",lease).select("id").single());
      return json({connected:true});
    }
    if(!c.tokens_cifrados)throw new PublicError("Un administrador debe conectar el OneDrive de la empresa.",409);
    let tokens=await unseal(c.tokens_cifrados);
    if(Date.parse(c.expires_at)<Date.now()+60000){
      tokens=await microsoftToken({grant_type:"refresh_token",refresh_token:tokens.refresh_token});
      requireOk(await db.from("onedrive_empresa").update({tokens_cifrados:await seal(tokens),expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString()}).eq("id",true).eq("lock_owner",lease).select("id").single());
    }
    if(body.action==="file") {
      const id=uuid.parse(body.id);
      const a=requireOk(await db.from("onedrive_archivos").select("*").eq("id",id).eq("finalizado",true).single());
      if(a.drive_id!==c.drive_id)throw new PublicError("El documento pertenece a otra conexión.",409);
      const response=await graph(tokens.access_token,`/drives/${encodeURIComponent(a.drive_id)}/items/${encodeURIComponent(a.item_id)}/content`);
      if(!response.ok)throw new PublicError("El archivo no está disponible en OneDrive.",404);
      const bytes=await limitedBody(response.body,maximum);
      return new Response(bytes,{headers:{...headers,"Content-Type":a.mime_type,"Content-Disposition":`attachment; filename="documento-${id}.${a.mime_type==="application/pdf"?"pdf":a.mime_type==="image/png"?"png":"jpg"}"`,"X-Content-Type-Options":"nosniff"}});
    }
    if(body.action!=="upload" || !form)throw new PublicError("Operación no reconocida.");
    const file=form.get("file");
    if(!(file instanceof File)||file.size<1||file.size>maximum)throw new PublicError("Selecciona un archivo de hasta 5 MB.");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const mime=bytes[0]===37&&bytes[1]===80&&bytes[2]===68&&bytes[3]===70&&bytes[4]===45?"application/pdf":bytes[0]===255&&bytes[1]===216&&bytes[2]===255?"image/jpeg":[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)?"image/png":null;
    if(!mime || mime!==file.type)throw new PublicError("Solo se admiten PDF, JPG y PNG con contenido válido.");
    const m=metadataSchema.parse(JSON.parse(String(form.get("metadata"))));
    if(m.pdf_remision && (!m.remision_id||mime!=="application/pdf"))throw new PublicError("Para guardar el PDF principal selecciona una remisión y un PDF.");
    if(m.remision_id){const r=requireOk(await db.from("remisiones").select("cliente_id").eq("id",m.remision_id).single());if(!r)throw new PublicError("La remisión no existe.");if(m.cliente_id&&m.cliente_id!==r.cliente_id)throw new PublicError("La remisión no pertenece al cliente seleccionado.");m.cliente_id=r.cliente_id;}
    if(m.cliente_id)requireOk(await db.from("clientes").select("id").eq("id",m.cliente_id).single());
    const fingerprint=await hash(JSON.stringify(m)+await hash(bytes));
    let a=requireOk(await db.from("onedrive_archivos").select("*").eq("id",m.id).maybeSingle());
    if(a && (a.usuario_id!==user.id||a.fingerprint!==fingerprint))throw new PublicError("La clave corresponde a otro archivo o datos distintos. Recupera la solicitud original.",409);
    if(a?.finalizado)return json({document:requireOk(await db.from("documentos").select("*").eq("id",m.id).single())});
    if(a && a.drive_id!==c.drive_id)throw new PublicError("La cuenta de OneDrive cambió.",409);
    if(!a)requireOk(await db.from("onedrive_archivos").insert({id:m.id,usuario_id:user.id,fingerprint,metadata:m,drive_id:c.drive_id,mime_type:mime,bytes:file.size}));
    const folder=await graph(tokens.access_token,"/me/drive/root:/ArizaERP");
    if(folder.status===404){const created=await graph(tokens.access_token,"/me/drive/root/children",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"ArizaERP",folder:{},"@microsoft.graph.conflictBehavior":"fail"})});if(!created.ok && created.status!==409)throw new PublicError("No se pudo preparar la carpeta de documentos.",502);}else if(!folder.ok)throw new PublicError("No se pudo consultar la carpeta de documentos.",502);
    const ext=mime==="application/pdf"?"pdf":mime==="image/png"?"png":"jpg";
    // Deterministic UUID path: retries replace the same bytes, never create another file.
    const uploaded=await graph(tokens.access_token,`/me/drive/root:/ArizaERP/${m.id}.${ext}:/content`,{method:"PUT",headers:{"Content-Type":mime},body:bytes});
    if(!uploaded.ok)throw new PublicError("No se confirmó la subida. Reintenta con el mismo archivo.",502);
    const item=z.object({id:z.string().min(1),webUrl:z.string().url()}).parse(await uploaded.json());
    if(!item.webUrl.startsWith("https://"))throw new PublicError("El enlace del archivo no es válido.",502);
    // Never persist @microsoft.graph.downloadUrl: it expires.
    const document=requireOk(await db.rpc("onedrive_finalizar",{p_id:m.id,p_owner:lease,p_actor:user.id,p_item:item.id,p_url:item.webUrl}));
    return json({document});
  } catch(error) {
    if(error instanceof PublicError)return json({error:error.message},error.status);
    if(error instanceof z.ZodError || error instanceof SyntaxError)return json({error:"Los datos recibidos no son válidos."},400);
    return json({error:"No se pudo confirmar la operación. Conserva la solicitud y vuelve a intentar."},503);
  } finally {
    if(db&&lease)await db.from("onedrive_empresa").update({lock_owner:null,lock_until:new Date(0).toISOString()}).eq("id",true).eq("lock_owner",lease);
  }
}
if(import.meta.main) Deno.serve(handleRequest);
