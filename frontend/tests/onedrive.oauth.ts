import { test, expect, type Page } from "@playwright/test";
import { mock, api, id } from "./fixtures";
const state="a".repeat(64),redirectUri="http://127.0.0.1:5174/onedrive/callback";
const endpoint=`${api}/functions/v1/onedrive`;
async function setup(page:Page, options={}) {
  await mock(page,options);let connected=false;
  await page.route(endpoint,async route=>{
    const body=route.request().postDataJSON();
    if(body.action==="complete"){connected=true;return route.fulfill({json:{connected:true}});}
    if(body.action==="start")return route.fulfill({json:{state,authorization_url:`https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`}});
    if(body.action==="status")return route.fulfill({json:{connected,account:connected?"Ariza":null}});
    if(body.action==="disconnect"){connected=false;return route.fulfill({json:{ok:true}});}
    if(body.action==="list")return route.fulfill({json:{documents:[],total:0}});
    return route.fulfill({json:{items:[]}});
  });
}
async function pending(page:Page,overrides={}){
  await page.addInitScript(value=>{if(!sessionStorage.getItem("seeded")){sessionStorage.setItem("ariza:onedrive:oauth",JSON.stringify(value));sessionStorage.setItem("seeded","yes");}},{state,userId:id,createdAt:Date.now(),redirectUri,...overrides});
}
test("callback completa una vez sin recibir ni guardar tokens Microsoft",async({page})=>{
  await setup(page);await pending(page);let calls=0;
  page.on("request",r=>{if(r.url()===endpoint&&r.postData()?.includes('"complete"'))calls++;});
  await page.goto(`/onedrive/callback?code=test-code&state=${state}`);
  await expect(page.getByRole("heading",{name:"Conexión completada"})).toBeVisible();
  expect(calls).toBe(1);expect(page.url()).toBe(redirectUri);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith("ariza:onedrive:")))).toEqual([]);
  await page.getByRole("link",{name:"Volver a Documentos"}).click();
  await expect(page.getByRole("heading",{name:"OneDrive conectado",exact:true})).toBeVisible();
});
for(const scenario of ["state","expired","owner","missing","cancel","no-session","inactive","seller"]){
  test(`callback rechaza ${scenario} sin intercambio`,async({page})=>{
    await setup(page,{session:scenario!=="no-session",active:scenario!=="inactive",role:scenario==="seller"?"VENDEDOR":"ADMIN"});
    if(scenario!=="missing")await pending(page,scenario==="expired"?{createdAt:Date.now()-700000}:scenario==="owner"?{userId:"otro"}:{});
    let calls=0;page.on("request",r=>{if(r.url()===endpoint&&r.postData()?.includes('"complete"'))calls++;});
    await page.goto(`/onedrive/callback?${scenario==="cancel"?"error=access_denied":"code=test-code"}&state=${scenario==="state"?"bad":state}`);
    await expect(page.getByRole("alert")).toBeVisible();expect(calls).toBe(0);expect(page.url()).toBe(redirectUri);
  });
}
test("fallo de intercambio no reutiliza código al recargar",async({page})=>{
  await setup(page);await pending(page);let calls=0;
  await page.route(endpoint,async r=>{if(r.request().postDataJSON().action!=="complete")return r.fallback();calls++;await r.abort();});
  await page.goto(`/onedrive/callback?code=test-code&state=${state}`);await expect(page.getByRole("alert")).toBeVisible();
  await page.reload();await expect(page.getByRole("alert")).toBeVisible();expect(calls).toBe(1);
});
test("inicio usa state emitido por servidor y consumers",async({page})=>{
  await setup(page);let target="";
  await page.route("https://login.microsoftonline.com/**",async r=>{target=r.request().url();await r.fulfill({body:"Microsoft simulado"});});
  await page.goto("/documentos");await page.getByRole("button",{name:"Conectar OneDrive",exact:true}).click();
  await expect.poll(()=>target).not.toBe("");expect(new URL(target).pathname).toBe("/consumers/oauth2/v2.0/authorize");expect(new URL(target).searchParams.get("state")).toBe(state);
});
test("vendedor consulta y no puede conectar cuenta",async({page})=>{
  await setup(page,{role:"VENDEDOR"});await page.goto("/documentos");
  await expect(page.getByRole("heading",{name:"Documentos guardados"})).toBeVisible();await expect(page.getByRole("button",{name:"Conectar OneDrive",exact:true})).toHaveCount(0);
});
