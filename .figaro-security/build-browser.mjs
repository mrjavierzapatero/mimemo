import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanEnvironment} from './install-scanner.mjs';
export function buildPlan(policy,root){
 if(!policy.browserBuild)return null;
 const spec=typeof policy.browserBuild==='string'?{directory:policy.browserBuild,script:'build'}:policy.browserBuild;
 if(!spec||typeof spec.directory!=='string'||!/^[-a-zA-Z0-9_:]+$/.test(spec.script))throw new Error('Build no declarado de forma segura');
 const cwd=path.resolve(root,spec.directory);
 if(cwd!==root&&!cwd.startsWith(root+path.sep))throw new Error('Build fuera del proyecto');
 const env=cleanEnvironment({CI:'true',NEXT_TELEMETRY_DISABLED:'1'});
 if(spec.fixtures!==undefined&&!['supabase-public-client','offline-provider-constructors'].includes(spec.fixtures))throw new Error('Fixture no reconocida');
 if(['supabase-public-client','offline-provider-constructors'].includes(spec.fixtures)){
  env.NEXT_PUBLIC_SUPABASE_URL='https://ci.example.invalid';
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY='ci-public-key';
 }
 if(spec.fixtures==='offline-provider-constructors'){
  env.SUPABASE_URL='https://ci.example.invalid';
  for(const name of ['SUPABASE_SERVICE_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY'])env[name]='ci-key';
 }
 return {cwd,script:spec.script,env};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const kit=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(kit,'..');
 const policy=JSON.parse(readFileSync(path.join(kit,'policy.json'),'utf8'));const plan=buildPlan(policy,root);
 if(plan){
  // Next/Vite load .env themselves: a sanitized parent environment is not enough.
  for(const dir of new Set([root,plan.cwd]))for(const f of ['.env','.env.local','.env.production','.env.production.local'])if(existsSync(path.join(dir,f)))throw new Error('Build de seguridad requiere checkout sin .env operativo; no se leen ni eliminan secretos');
  execFileSync('npm',['ci'],{cwd:plan.cwd,env:plan.env,stdio:'inherit',timeout:240000});
  execFileSync('npm',['run',plan.script],{cwd:plan.cwd,env:plan.env,stdio:'inherit',timeout:240000});
 }else console.log('No hay build de navegador declarado; no se simula su comprobacion.');
}
