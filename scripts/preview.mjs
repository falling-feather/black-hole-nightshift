import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,isAbsolute,extname} from 'node:path';
import {execFile} from 'node:child_process';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const url='http://127.0.0.1:5198/';
const openBrowser=()=>{
  if(process.argv.includes('--no-open')) return;
  if(process.platform==='win32') execFile('cmd.exe',['/c','start','',url],{windowsHide:true});
  else console.log(`Open ${url} in your browser.`);
};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.mp4':'video/mp4'};
try {await stat(resolve(root,'index.html'));}
catch {console.error('Build missing. Run pnpm install and pnpm run build in this project first.');process.exit(1);}

const server=createServer(async(request,response)=>{
  if(request.method!=='GET' && request.method!=='HEAD'){response.writeHead(405).end();return;}
  if(request.url==='/__nightshift_health'){
    response.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({app:'event-horizon-nightshift'}));return;
  }
  let pathname;
  try {pathname=decodeURIComponent(new URL(request.url??'/',url).pathname);}
  catch {response.writeHead(400).end();return;}
  const file=resolve(root,pathname==='/'?'index.html':`.${pathname}`);
  const inside=relative(root,file);
  if(inside.startsWith('..') || isAbsolute(inside)){response.writeHead(403).end();return;}
  try {
    const content=await readFile(file);
    response.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Cache-Control':'no-cache'});
    response.end(request.method==='HEAD'?undefined:content);
  } catch {response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Not found');}
});
server.on('error',async(error)=>{
  if(error.code==='EADDRINUSE'){
    try {
      const existing=await fetch(`${url}__nightshift_health`,{signal:AbortSignal.timeout(2000)});
      if((await existing.json()).app==='event-horizon-nightshift'){openBrowser();process.exit(0);}
    } catch { /* The occupied port belongs to another service. */ }
    console.error('Port 5198 is occupied. Close the other preview before starting this project.');
  } else console.error(error.message);
  process.exitCode=1;
});
server.listen(5198,'127.0.0.1',()=>{
  console.log(`Black Hole Night Shift is ready: ${url}`);
  console.log('Keep this window open during the experience. Press Ctrl+C to stop.');
  openBrowser();
});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
