import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,existsSync,mkdtempSync,chmodSync,writeFileSync,rmSync,lstatSync,readdirSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {scannerPath,cleanEnvironment,VERSION} from './install-scanner.mjs';
const kit=path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE_NAME=/(?:SECRET|PASSWORD|PRIVATE|API[_-]?KEY|SERVICE[_-]?(?:ROLE|KEY)|SUPABASE_KEY|DATABASE_URL|(?:ACCESS|AUTH|REFRESH)[_-]?TOKEN|STRIPE_SECRET)/i;
const PUBLIC_NAME=/^(?:NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_)/;
const CODE=/\.(?:[cm]?[jt]sx?|vue|svelte|html|astro)$/i;
const SAFE_PUBLIC=[
 'NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
 'VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_PUBLISHABLE_KEY',
 'NEXT_PUBLIC_SITE_URL','NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_POSTHOG_HOST','NEXT_PUBLIC_POSTHOG_KEY',
 'NEXT_PUBLIC_POSTHOG_PRODUCT','NEXT_PUBLIC_POSTHOG_AUTOCAPTURE','NEXT_PUBLIC_POSTHOG_SESSION_REPLAY',
 'NEXT_PUBLIC_GA_MEASUREMENT_ID','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY','VITE_STRIPE_PUBLISHABLE_KEY'
];
export function analyzeText(file,text,{client=false,allowedPublic=SAFE_PUBLIC}={}) {
 const findings=[];const add=(rule,line=1)=>findings.push({file,line,rule});
 const lines=text.split('\n');
 lines.forEach((line,i)=>{
  for(const m of line.matchAll(/(?:process\.env|import\.meta\.env)(?:\.([A-Z][A-Z0-9_]*)|\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\])/g)){
   const name=m[1]||m[2];
   if(PUBLIC_NAME.test(name)&&(PRIVATE_NAME.test(name)||!allowedPublic.includes(name)))add('public-env-not-approved',i+1);
   if(client&&!PUBLIC_NAME.test(name)&&PRIVATE_NAME.test(name))add('private-env-in-client',i+1);
  }
  if(client&&/(?:from\s*|import\s*)['"]server-only['"]|require\(['"]server-only['"]\)/.test(line))add('server-only-import-in-client',i+1);
 });
 if(/(?:vite|next)\.config\./.test(file)){
  if(/envPrefix\s*:/.test(text))add('custom-public-env-prefix-needs-review');
  if(/(?:define|env)\s*:\s*\{[\s\S]*?(?:\.\.\.\s*process\.env|process\.env\s*[,}])/.test(text))add('bulk-env-exposure');
  for(const block of text.matchAll(/\benv\s*:\s*\{([^}]*)\}/g))if(PRIVATE_NAME.test(block[1]))add('private-env-in-framework-config');
 }
 return findings;
}
export function pushRanges(input){
 return input.split('\n').filter(Boolean).map(line=>{
  const fields=line.trim().split(/\s+/);if(fields.length!==4||!fields[2].startsWith('refs/')||!fields.slice(1).filter((_,i)=>i!==1).every(v=>/^[a-f0-9]{40,64}$/.test(v)))throw new Error('Entrada pre-push invalida');
  const [,local,,remote]=fields;if(/^0+$/.test(local))return null;
  return /^0+$/.test(remote)?local:`${remote}..${local}`;
 }).filter(Boolean);
}
export function reviewHistoryFinding(finding,entries){
 // Immutable commit identity: never applies to staged files, exports or a new commit.
 if(!/^[a-f0-9]{40,64}$/.test(finding.commit||''))return false;
 return entries.some(e=>e.commit===finding.commit&&e.file===finding.file&&e.line===finding.line&&e.rule===finding.rule&&typeof e.reason==='string'&&e.reason.length>20&&e.reviewedAt);
}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:64*1024*1024,env:cleanEnvironment(),stdio:['ignore','pipe','pipe']});}
function collectTree(root,ref){
 const index=ref==='INDEX';const raw=git(root,index?['ls-files','--stage','-z']:['ls-tree','-r','-z',ref]);const out=new Map();
 for(const rec of raw.split('\0').filter(Boolean)){
  const cut=rec.indexOf('\t');const file=rec.slice(cut+1);const meta=rec.slice(0,cut).split(' ');
  if(index&&meta[2]!=='0')throw new Error('Indice en conflicto');
  if(!/^(?:100644|100755)$/.test(meta[0]))continue;
  if(file.startsWith('.figaro-security/'))continue;
  if(!CODE.test(file)&&!/(^|\/)\.env(?:\.|$)/.test(file))continue;
  const blob=git(root,['cat-file','blob',meta[index?1:2]]);if(Buffer.byteLength(blob)>4*1024*1024)throw new Error('Archivo de codigo demasiado grande para el control');
  out.set(file,blob);
 }
 return out;
}
export function inspectTree(files,options={}){
 const findings=[];const clients=new Set();
 for(const [file,text]of files){
  if(/(^|\/)\.env(?:\.|$)/.test(file)&&!/(?:\.example|\.sample|\.template)$/.test(file))findings.push({file,line:1,rule:'operational-env-tracked'});
  if(CODE.test(file)&&/^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/.test(text))clients.add(file);
  if(/(?:^|\/)public\//.test(file)&&CODE.test(file))clients.add(file);
  if(/(?:^|\/)vite\.config\./.test(file)){
   const prefix=path.posix.dirname(file);for(const f of files.keys())if(CODE.test(f)&&(prefix==='.'||f.startsWith(prefix+'/'))&&!/(?:^|\/)(?:server|api|scripts|tests)\//.test(f)&&!f.includes('.config.'))clients.add(f);
  }
 }
 // Traverse relative and standard @/ imports from client entry points. Unknown
 // alias/re-export patterns remain a documented limit, not a claimed proof.
 const queue=[...clients];for(let i=0;i<queue.length;i++){
  const file=queue[i],text=files.get(file)||'';
  for(const m of text.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)){
   const imp=m[1];let base;
   if(imp.startsWith('.'))base=path.posix.normalize(path.posix.join(path.posix.dirname(file),imp));
   else if(imp.startsWith('@/')){const marker=file.indexOf('/src/');base=(marker>=0?file.slice(0,marker+5):file.startsWith('src/')?'src/':file.startsWith('frontend/')?'frontend/':file.startsWith('app/')?'app/':'')+imp.slice(2);}
   else continue;
   const found=[base,...['.ts','.tsx','.js','.jsx','.mjs','/index.ts','/index.tsx','/index.js'].map(s=>base+s)].find(f=>files.has(f));
   if(found&&!clients.has(found)){clients.add(found);queue.push(found);}
  }
 }
 for(const [file,text]of files)if(CODE.test(file))findings.push(...analyzeText(file,text,{...options,client:clients.has(file)}));
 return findings;
}
function scanner(root,command,extra=[]){
 const bin=scannerPath(root);if(!existsSync(bin))throw new Error('Escaner ausente. Ejecutar node .figaro-security/install-scanner.mjs');
 if(execFileSync(bin,['version'],{encoding:'utf8',env:cleanEnvironment()}).trim()!==VERSION)throw new Error('Version del escaner incorrecta');
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-secret-report-'));chmodSync(temp,0o700);const report=path.join(temp,'report.json');
 // No raw report is printed, uploaded or retained. No baseline, inline bypass,
 // user .gitleaksignore or inherited GITLEAKS_* options can disable the guard.
 try{
  const result=spawnSync(bin,[command,...extra,'--config',path.join(kit,'gitleaks.toml'),'--gitleaks-ignore-path',path.join(temp,'no-ignores'),'--ignore-gitleaks-allow','--redact=100','--no-banner','--no-color','--log-level','error','--timeout','120','--exit-code','10','--report-format','json','--report-path',report],{cwd:root,env:cleanEnvironment(),encoding:'utf8',maxBuffer:1024*1024,timeout:125000});
  if(result.error||![0,10].includes(result.status))throw new Error('Escaneo incompleto; se bloquea la salida sin imprimir logs sensibles');
  const raw=existsSync(report)?JSON.parse(readFileSync(report,'utf8')):[];
  const findings=raw.map(f=>({file:f.File,line:f.StartLine,rule:f.RuleID,commit:f.Commit||undefined}));
  const reviewedPath=path.join(kit,'reviewed-history-findings.json');
  const reviewed=existsSync(reviewedPath)?JSON.parse(readFileSync(reviewedPath,'utf8')).entries:[];
  if(!Array.isArray(reviewed))throw new Error('Registro de revisiones historicas invalido');
  const out=findings.filter(f=>!reviewHistoryFinding(f,reviewed));out.reviewedCount=findings.length-out.length;return out;
 }finally{rmSync(temp,{recursive:true,force:true});}
}
export function inspectArtifactValues(file,text,env){
 const findings=[];for(const [name,value]of Object.entries(env))if(PRIVATE_NAME.test(name)&&!PUBLIC_NAME.test(name)&&typeof value==='string'&&value.length>=12){
  if([value,encodeURIComponent(value),Buffer.from(value).toString('base64')].some(v=>text.includes(v)))findings.push({file,line:1,rule:'private-runtime-value-in-browser'});
 }return findings;
}
function walkPublic(root,relative){
 const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep)||!existsSync(target))return [];
 const found=[];const visit=dir=>{for(const e of readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isSymbolicLink())throw new Error('Enlace simbolico en artefacto publico');if(e.isDirectory())visit(full);else if(e.isFile())found.push(full);}};visit(target);return found;
}
export function checkGovernance(policy){
 const findings=[];const contexts=new Set();
 for(const env of ['development','test','production']){
  const p=policy.environments?.[env];
  if(!p||p.status!=='verified'||!p.storeReference||!p.principalReference||!p.permissionEvidence||!p.verifiedAt) {findings.push({file:'policy.json',line:1,rule:`secret-management-${env}-unverified`});continue;}
  if(contexts.has(p.principalReference))findings.push({file:'policy.json',line:1,rule:'environment-principal-reused'});contexts.add(p.principalReference);
  if(p.minimumPrivileges!==true||p.noProductionInTests!==true)findings.push({file:'policy.json',line:1,rule:'least-privilege-unverified'});
 }return findings;
}
export function main(mode,root=process.cwd(),input=''){
 root=path.resolve(root);const findings=[];let scans=0,reviewedHistoryFindings=0;const policy=JSON.parse(readFileSync(path.join(kit,'policy.json'),'utf8'));
 const scan=(command,extra)=>{const f=scanner(root,command,extra);findings.push(...f);reviewedHistoryFindings+=f.reviewedCount||0;scans++;};
 if(mode==='governance')return {mode,findings:checkGovernance(policy)};
 if(mode==='staged'){
  scan('git',['--pre-commit','--staged',root]);
  findings.push(...inspectTree(collectTree(root,'INDEX')));
 }else if(mode==='push'){
  for(const range of pushRanges(input)){
   scan('git',[`--log-opts=${range}`,root]);
   findings.push(...inspectTree(collectTree(root,range.split('..').at(-1))));
  }
 }else if(mode==='ci'||mode==='history'){
  scan('git',['--log-opts=--all',root]);
  findings.push(...inspectTree(collectTree(root,'HEAD')));
 }else if(mode==='source'){
  findings.push(...inspectTree(collectTree(root,'INDEX')));
 }else if(mode==='export'){
  scan('dir',[root]);
 }else if(mode==='browser'){
  if(policy.browserBuild&&!walkPublic(root,policy.browserArtifacts[0]).length)throw new Error('Falta el artefacto compilado del navegador; public/ por si solo no acredita el build');
  let count=0;for(const dir of policy.browserArtifacts||[]){
   const files=walkPublic(root,dir);if(!files.length)continue;count+=files.length;
   scan('dir',[path.join(root,dir)]);
   for(const f of files){const b=readFileSync(f);if(!b.includes(0))findings.push(...inspectArtifactValues(path.relative(root,f),b.toString('utf8'),process.env));}
  }
  if(policy.browserBuild&&!count)throw new Error('Falta el artefacto de navegador; construir antes de verificar');
  if(!policy.browserBuild&&!count)return {mode,applicable:false,scans:0,findings:[]};
 }else throw new Error('Modo no admitido');
 return {mode,applicable:true,scans,reviewedHistoryFindings,findings};
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const mode=process.argv[2];const result=main(mode,process.argv[3]||process.cwd(),mode==='push'?readFileSync(0,'utf8'):'');console.log(JSON.stringify(result));process.exitCode=result.findings.length?1:0;}
 catch(e){console.error(JSON.stringify({status:'blocked',reason:e.message}));process.exitCode=2;}
}
