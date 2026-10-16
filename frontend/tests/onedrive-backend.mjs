import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const source=['backend/onedrive/functions/onedrive/index.ts','../supabase/functions/onedrive/index.ts'].find(p=>fs.existsSync(p));
assert.ok(source,'Run from the frontend/workspace directory');
const code=fs.readFileSync(source,'utf8').replace('npm:@supabase/supabase-js@2.117.2','@supabase/supabase-js').replace('npm:zod@4.0.0','zod');
fs.mkdirSync('tmp',{recursive:true});
fs.writeFileSync('tmp/onedrive-handler.mjs',ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
fs.writeFileSync('tmp/onedrive-check.ts','declare const Deno: {env:{get(name:string):string|undefined};serve(fn:(req:Request)=>Promise<Response>):void};\ninterface ImportMeta {main?:boolean}\n'+code);
const secret=Buffer.alloc(32,7).toString('base64');
globalThis.Deno={env:{get:n=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',CLIENT_ID:'test-client',CLIENT_SECRET:'test-secret',ONEDRIVE_ENCRYPTION_KEY:secret})[n]}};
const {handleRequest}=await import(pathToFileURL(path.resolve('tmp/onedrive-handler.mjs')).href);
const id='11111111-1111-4111-8111-111111111111';
const uploadId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const metadata={id:uploadId,nombre:'Prueba',tipo_documento:'OTRO',cliente_id:null,remision_id:null,pdf_remision:false};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
async function encrypt(value){const iv=crypto.getRandomValues(new Uint8Array(12));const key=await crypto.subtle.importKey('raw',Buffer.from(secret,'base64'),'AES-GCM',false,['encrypt']);return Buffer.from(iv).toString('base64')+'.'+Buffer.from(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)))).toString('base64');}
async function fixture({role='ADMIN',active=true,authError=false,failUpload=false}={}){
  let oauth=null,upload=null;const calls=[];const tokens={access_token:'MICROSOFT_ACCESS_SECRET',refresh_token:'MICROSOFT_REFRESH_SECRET',expires_in:3600};
  let c={id:true,tokens_cifrados:await encrypt(tokens),expires_at:new Date(Date.now()+3600000).toISOString(),drive_id:'drive-test',cuenta:'Ariza'};
  const document={...metadata,onedrive_url:'https://onedrive.live.com/permanent',subido_por:id,created_at:new Date().toISOString()};
  globalThis.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url);const method=options.method??'GET';let b;try{b=JSON.parse(options.body);}catch{b=options.body;}
    calls.push({url:url.href,method,body:b});
    if(url.pathname==='/auth/v1/user')return authError?json({message:'invalid'},401):json({id,email:'test@example.com'});
    if(url.pathname.endsWith('/perfiles'))return json({rol:role,activo:active});
    if(url.pathname.endsWith('/rpc/onedrive_lock'))return json(true);
    if(url.pathname.endsWith('/onedrive_empresa')){if(method==='PATCH'){c={...c,...b};return options.headers?.Prefer?.includes('representation')?json({id:true}):json({id:true});}return json(c);}
    if(url.pathname.endsWith('/onedrive_oauth')){if(method==='POST'){oauth=b;return json(null,201);}if(method==='DELETE'){const match=url.searchParams.has('state_hash');if(!match){oauth=null;return json(null);}const result=oauth;oauth=null;return json(result);}return json(null);}
    if(url.pathname.endsWith('/onedrive_archivos')){if(method==='POST'){upload={...b,finalizado:false};return json(null,201);}return json(upload);}
    if(url.pathname.endsWith('/documentos'))return json(document);
    if(url.pathname.endsWith('/rpc/onedrive_finalizar')){upload.finalizado=true;upload.item_id=b.p_item;return json(document);}
    if(url.hostname==='login.microsoftonline.com')return json(tokens);
    if(url.hostname==='graph.microsoft.com'){
      if(url.pathname==='/v1.0/me/drive')return json({id:'drive-test',owner:{user:{displayName:'Ariza'}}});
      if(method==='PUT'){if(failUpload){failUpload=false;throw new Error('simulated disconnect');}return json({id:'item-test',webUrl:'https://onedrive.live.com/permanent','@microsoft.graph.downloadUrl':'https://temporary.example/never-persist'});}
      return json({id:'folder-test'});
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  return {calls,getConnection:()=>c,getOauth:()=>oauth};
}
function request(body,token=true){return new Request('http://edge.test/onedrive',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer test-user'}:{})},body:JSON.stringify(body)});}
function uploadRequest(){const form=new FormData();form.set('metadata',JSON.stringify(metadata));form.set('file',new File(['%PDF-1.4 test'],'test.pdf',{type:'application/pdf'}));return new Request('http://edge.test/onedrive',{method:'POST',headers:{Authorization:'Bearer test-user'},body:form});}
test('missing JWT, invalid JWT and inactive profiles rejected',async()=>{
  await fixture();assert.equal((await handleRequest(request({action:'status'},false))).status,401);
  await fixture({authError:true});assert.equal((await handleRequest(request({action:'status'}))).status,401);
  await fixture({active:false});assert.equal((await handleRequest(request({action:'status'}))).status,403);
});
test('seller cannot start, complete, upload or disconnect',async()=>{
  const f=await fixture({role:'VENDEDOR'});
  for(const action of ['start','complete','disconnect'])assert.equal((await handleRequest(request({action}))).status,403);
  assert.equal((await handleRequest(uploadRequest())).status,403);
  assert.equal(f.calls.filter(c=>c.url.includes('graph.microsoft')).length,0);
});
test('status exposes connection state, never encrypted or plaintext tokens',async()=>{
  await fixture();const r=await handleRequest(request({action:'status'}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{connected:true,account:'Ariza'});
});
test('OAuth start binds server state to user and stores encrypted PKCE verifier',async()=>{
  const f=await fixture();const r=await handleRequest(request({action:'start',redirect_uri:'http://localhost:5173/onedrive/callback'}));assert.equal(r.status,200);const body=await r.json();const url=new URL(body.authorization_url);
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('state'),body.state);assert.equal(f.getOauth().usuario_id,id);assert.notEqual(f.getOauth().state_hash,body.state);assert.ok(f.getOauth().verifier_cifrado.includes('.'));
});
test('OAuth rejects unregistered redirect and consumed state',async()=>{
  await fixture();assert.equal((await handleRequest(request({action:'start',redirect_uri:'https://evil.example/callback'}))).status,400);
  const r=await handleRequest(request({action:'complete',state:'a'.repeat(64),code:'test',redirect_uri:'http://localhost:5173/onedrive/callback'}));assert.equal(r.status,400);
});
test('OAuth completion sends no Microsoft credentials to frontend',async()=>{
  const f=await fixture();const start=await (await handleRequest(request({action:'start',redirect_uri:'http://localhost:5173/onedrive/callback'}))).json();
  const r=await handleRequest(request({action:'complete',state:start.state,code:'test',redirect_uri:'http://localhost:5173/onedrive/callback'}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{connected:true});assert.ok(!f.getConnection().tokens_cifrados.includes('MICROSOFT'));
});
test('lost upload retries same path; completed replay does not upload again',async()=>{
  const f=await fixture({failUpload:true});assert.equal((await handleRequest(uploadRequest())).status,503);
  assert.equal((await handleRequest(uploadRequest())).status,200);assert.equal((await handleRequest(uploadRequest())).status,200);
  const puts=f.calls.filter(c=>c.method==='PUT');assert.equal(puts.length,2);assert.equal(puts[0].url,puts[1].url);
  const final=f.calls.find(c=>c.url.endsWith('/rpc/onedrive_finalizar'));assert.equal(final.body.p_url,'https://onedrive.live.com/permanent');assert.equal(f.calls.filter(c=>c.url.endsWith('/onedrive_archivos')&&c.method==='POST').length,1);
});
test('same upload UUID with changed metadata is rejected',async()=>{
  await fixture();assert.equal((await handleRequest(uploadRequest())).status,200);
  const form=new FormData();form.set('metadata',JSON.stringify({...metadata,nombre:'Changed'}));form.set('file',new File(['%PDF-1.4 test'],'test.pdf',{type:'application/pdf'}));
  const r=await handleRequest(new Request('http://edge.test/onedrive',{method:'POST',headers:{Authorization:'Bearer test-user'},body:form}));assert.equal(r.status,409);
});
