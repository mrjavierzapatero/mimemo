import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanEnvironment} from './install-scanner.mjs';
const kit=path.dirname(fileURLToPath(import.meta.url));
const policy=JSON.parse(readFileSync(path.join(kit,'policy.json'),'utf8'));
if(policy.browserBuild){
 const spec=typeof policy.browserBuild==='string'?{directory:policy.browserBuild,script:'build'}:policy.browserBuild;
 if(!spec||typeof spec.directory!=='string'||!/^[-a-zA-Z0-9_:]+$/.test(spec.script))throw new Error('Build no declarado de forma segura');
 const root=path.resolve(kit,'..');const cwd=path.resolve(root,spec.directory);
 if(cwd!==root&&!cwd.startsWith(root+path.sep))throw new Error('Build fuera del proyecto');
 // Isolated CI build: never inject application, database or payment secrets.
 const env=cleanEnvironment({CI:'true',NEXT_TELEMETRY_DISABLED:'1'});
 execFileSync('npm',['ci'],{cwd,env,stdio:'inherit',timeout:240000});
 execFileSync('npm',['run',spec.script],{cwd,env,stdio:'inherit',timeout:240000});
}else console.log('No hay build de navegador declarado; no se simula su comprobacion.');
