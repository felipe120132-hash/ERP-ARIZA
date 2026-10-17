import { z } from "zod";
import { documentoSchema } from "@/types/schemas";
import { onedriveRequest } from "./onedriveService";
export const tiposDocumento = { FACTURA_DIAN:"Factura DIAN", COTIZACION_CHINA:"Cotización China", LEGAL:"Legal", OTRO:"Otro" };
export type MetadataDocumento = {id:string;nombre:string;tipo_documento:keyof typeof tiposDocumento;cliente_id:string|null;remision_id:string|null;pdf_remision:boolean};
export type SolicitudDocumento = {key:string;metadata:MetadataDocumento;file:File};
export async function validarDocumento(file:File){
  if(file.size===0||file.size>5*1024*1024)throw new Error("Selecciona un archivo de hasta 5 MB.");
  const b=new Uint8Array(await file.slice(0,8).arrayBuffer());
  const valid=file.type==="application/pdf"?String.fromCharCode(...b.slice(0,5))==="%PDF-":file.type==="image/jpeg"?b[0]===255&&b[1]===216&&b[2]===255:file.type==="image/png"?[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v):false;
  if(!valid)throw new Error("Selecciona un PDF, JPG o PNG válido.");
}
const completed=z.object({document:documentoSchema});
export const documentosEmpresaService={
  async listar(filters:{page:number;q:string;tipo:string;cliente_id?:string;remision_id?:string}){return z.object({documents:z.array(documentoSchema),total:z.number().int().nonnegative()}).parse(await onedriveRequest({action:"list",...filters}));},
  async clientes(q:string){return z.object({items:z.array(z.object({id:z.guid(),nombre_tienda:z.string()}))}).parse(await onedriveRequest({action:"references",kind:"clientes",q})).items;},
  async remisiones(q:string,cliente_id:string|null,id?:string){return z.object({items:z.array(z.object({id:z.guid(),consecutivo:z.union([z.number(),z.string()]),cliente_id:z.guid()}))}).parse(await onedriveRequest({action:"references",kind:"remisiones",q,cliente_id,id})).items;},
  async subir(s:SolicitudDocumento){await validarDocumento(s.file);const form=new FormData();form.set("metadata",JSON.stringify(s.metadata));form.set("file",s.file);return completed.parse(await onedriveRequest(form)).document;},
  async recuperar(id:string){return z.object({document:documentoSchema.nullable()}).parse(await onedriveRequest({action:"recover",id})).document;},
  async descargar(id:string,nombre:string){const blob=await onedriveRequest({action:"file",id},true) as Blob;const url=URL.createObjectURL(blob);const a=document.createElement("a");const ext=blob.type==="application/pdf"?"pdf":blob.type==="image/png"?"png":"jpg";a.href=url;a.download=`${nombre.replace(/[^\p{L}\p{N} ._-]/gu,"_")}.${ext}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);},
};
// Keep the original file and metadata across reloads. No OAuth tokens enter this store.
async function draftDb(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open("ariza-documentos",1);r.onupgradeneeded=()=>r.result.createObjectStore("pendientes",{keyPath:"key"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error("No pudimos abrir el almacenamiento de la solicitud."));});}
export async function solicitudDocumento(key:string,action:"read"|"save"|"delete",value?:SolicitudDocumento):Promise<SolicitudDocumento|null>{
  const db=await draftDb();return new Promise((resolve,reject)=>{const tx=db.transaction("pendientes",action==="read"?"readonly":"readwrite");const store=tx.objectStore("pendientes");const request=action==="read"?store.get(key):action==="save"?store.put(value):store.delete(key);let result:SolicitudDocumento|null=null;request.onsuccess=()=>{if(action==="read")result=request.result??null;};tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error("No pudimos conservar la solicitud. Comprueba el almacenamiento del navegador."));};});
}
