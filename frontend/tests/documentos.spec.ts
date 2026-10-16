import {test,expect,type Page} from "@playwright/test";
import {mock,api,id,now} from "./fixtures";
const endpoint=`${api}/functions/v1/onedrive`;
const doc={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",tipo_documento:"LEGAL",nombre:"Acuerdo comercial",onedrive_url:"https://onedrive.live.com/test",cliente_id:null,remision_id:null,subido_por:id,created_at:now};
async function setup(page:Page,role="ADMIN"){
  await mock(page,{role});
  await page.route(endpoint,async r=>{
    if(r.request().headers()["content-type"]?.startsWith("multipart"))return r.fulfill({json:{document:doc}});
    const b=r.request().postDataJSON();
    if(b.action==="status")return r.fulfill({json:{connected:true,account:"Distribuciones Ariza"}});
    if(b.action==="list")return r.fulfill({json:{documents:b.q&&!doc.nombre.includes(b.q)?[]:[doc],total:1}});
    if(b.action==="references")return r.fulfill({json:{items:[]}});
    if(b.action==="recover")return r.fulfill({json:{document:doc}});
    if(b.action==="file")return r.fulfill({contentType:"application/pdf",body:"%PDF-1.4 test"});
    return r.fulfill({json:{ok:true}});
  });await page.goto("/documentos");
}
async function fill(page:Page){await page.getByLabel("Seleccionar archivo",{exact:true}).setInputFiles({name:"acuerdo.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4 test")});await page.getByLabel("Nombre del documento",{exact:true}).fill("Acuerdo comercial");await page.getByLabel("Tipo de documento",{exact:true}).selectOption("LEGAL");await page.getByRole("button",{name:"Revisar documento",exact:true}).click();}
test("archivo: listado, filtro y descarga autenticada",async({page})=>{
  await setup(page);await expect(page.getByRole("heading",{name:doc.nombre,exact:true})).toBeVisible();
  const download=page.waitForEvent("download");await page.getByRole("button",{name:`Descargar ${doc.nombre}`}).click();expect((await download).suggestedFilename()).toBe("Acuerdo comercial.pdf");
  await page.getByLabel("Buscar documentos").fill("inexistente");await expect(page.getByText("No hay documentos para mostrar")).toBeVisible();
});
test("subida requiere revisión y confirma guardado",async({page})=>{
  await setup(page);let writes=0;page.on("request",r=>{if(r.url()===endpoint&&r.headers()["content-type"]?.startsWith("multipart"))writes++;});
  await fill(page);expect(writes).toBe(0);await page.getByRole("button",{name:"Confirmar y subir",exact:true}).click();
  await expect(page.getByText(/Documento «Acuerdo comercial» guardado/)).toBeVisible();expect(writes).toBe(1);
});
test("respuesta perdida conserva archivo tras recarga y reconcilia sin reenviar",async({page})=>{
  await setup(page);let writes=0;
  await page.route(endpoint,async r=>{if(!r.request().headers()["content-type"]?.startsWith("multipart"))return r.fallback();writes++;await r.abort();});
  await fill(page);await page.getByRole("button",{name:"Confirmar y subir",exact:true}).click();await expect(page.getByText("Subida pendiente de confirmar")).toBeVisible();
  await page.reload();await expect(page.getByText("Subida pendiente de confirmar")).toBeVisible();await page.getByRole("button",{name:"Consultar resultado",exact:true}).click();await expect(page.getByText(/Documento «Acuerdo comercial» guardado/)).toBeVisible();expect(writes).toBe(1);
});
test("rechaza contenido falso antes de subir",async({page})=>{
  await setup(page);await page.getByLabel("Seleccionar archivo",{exact:true}).setInputFiles({name:"falso.pdf",mimeType:"application/pdf",buffer:Buffer.from("not a pdf")});await page.getByLabel("Nombre del documento",{exact:true}).fill("Falso");await page.getByRole("button",{name:"Revisar documento",exact:true}).click();await expect(page.getByRole("alert")).toContainText("PDF, JPG o PNG válido");
});
test("vendedor solo consulta; móvil sin desbordes",async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page,"VENDEDOR");await expect(page.getByRole("heading",{name:doc.nombre,exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Nuevo documento"})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("backend sin desplegar muestra estado explícito",async({page})=>{
  await setup(page);await page.route(endpoint,r=>r.fulfill({status:404,json:{error:"not found"}}));await page.reload();await expect(page.getByRole("alert")).toContainText("aún no está desplegado");await expect(page.getByRole("button",{name:"Revisar documento",exact:true})).toBeDisabled();
});
test("archivo de una remisión filtra y permite volver a todos",async({page})=>{
  await setup(page);const calls:any[]=[];
  page.on("request",r=>{if(r.url()===endpoint&&r.headers()["content-type"]?.includes("application/json")){const b=r.postDataJSON();if(b.action==="list")calls.push(b);}});
  await page.goto(`/documentos?remision=${doc.id}`);
  await expect(page.getByText(/Mostrando documentos de la remisión/)).toBeVisible();
  await expect.poll(()=>calls.at(-1)?.remision_id).toBe(doc.id);
  await page.getByRole("button",{name:"Ver todos los documentos"}).click();
  await expect.poll(()=>calls.at(-1)?.remision_id??null).toBe(null);
});
test("panel de carga adaptable a escritorio y móvil",async({page})=>{
  await setup(page);await expect(page.getByRole("heading",{name:doc.nombre,exact:true})).toBeVisible();
  await page.screenshot({path:"output/frontend/documentos-empresa-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:"output/frontend/documentos-empresa-mobile.png",fullPage:true});
});
