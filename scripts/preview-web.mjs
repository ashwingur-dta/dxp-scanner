import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = 'apps/web/dist';
const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json' };
const server = createServer((req,res)=>{
  const u=new URL(req.url,'http://x');
  if (u.pathname==='/reports/leaderboard.json'){res.writeHead(200,{'content-type':'application/json'});res.end(readFileSync('/tmp/lb.json'));return;}
  let p=u.pathname; if(!extname(p)) p='/index.html';
  try{const b=readFileSync(join(ROOT,p));res.writeHead(200,{'content-type':TYPES[extname(p)]??'text/plain'});res.end(b);}
  catch{res.writeHead(404).end('x');}
});
await new Promise(r=>server.listen(4174,r));
const br=await chromium.launch();
const ctx=await br.newContext({viewport:{width:1000,height:1000},deviceScaleFactor:1});
for (const [path,name,h] of [['/','home',980],['/leaderboard','lb',900]]) {
  const pg=await ctx.newPage();
  await pg.goto('http://localhost:4174'+path,{waitUntil:'load'});
  await pg.waitForTimeout(700);
  await pg.screenshot({path:`/tmp/ui-${name}.png`, clip:{x:0,y:0,width:1000,height:h}});
  await pg.close();
}
await ctx.close(); await br.close(); server.close();
console.log('ok');
