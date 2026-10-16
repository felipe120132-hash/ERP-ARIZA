// Retired: the old endpoint exposed Microsoft tokens to the browser.
Deno.serve(() => new Response(JSON.stringify({error:"Actualiza el ERP para utilizar la conexión empresarial de OneDrive."}),{status:410,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Cache-Control":"no-store"}}));
