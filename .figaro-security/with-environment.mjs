import {readFileSync,realpathSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanEnvironment} from './install-scanner.mjs';
import {PRIVATE_NAME} from './guard.mjs';
export function buildEnvironment(policy,context,available){
 if(!['development','test','production'].includes(context))throw new Error('Entorno no reconocido');
 const p=policy.environments?.[context];
 if(!p||p.status!=='verified'||!p.storeReference||!p.principalReference||!p.permissionEvidence||!p.verifiedAt||p.minimumPrivileges!==true||p.noProductionInTests!==true)throw new Error('Entorno sin evidencia de permisos minimos/separacion');
 for(const [name,other]of Object.entries(policy.environments||{}))if(name!==context&&other.principalReference===p.principalReference)throw new Error('Identidad de acceso compartida entre entornos');
 if(!Array.isArray(p.variables))throw new Error('Falta lista cerrada de variables');
 const output={};
 for(const name of p.variables){
  if(!/^[A-Z][A-Z0-9_]*$/.test(name)||/^(?:PATH|HOME|NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|LD_|DYLD_)/.test(name))throw new Error('Variable de entorno no permitida');
  if(typeof available[name]!=='string'||!available[name])throw new Error('Falta una variable requerida; no se muestran valores');
  if(context!=='production'&&PRIVATE_NAME.test(name)&&/(?:^|_)PROD(?:UCTION)?(?:_|$)/.test(name))throw new Error('Secreto de produccion solicitado fuera de produccion');
  output[name]=available[name];
 }
 return output;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const context=process.argv[2];if(process.argv[3]!=='--'||!process.argv[4])throw new Error('Uso: with-environment.mjs test -- comando argumentos');
  const policy=JSON.parse(readFileSync(new URL('./policy.json',import.meta.url),'utf8'));
  const env=buildEnvironment(policy,context,process.env);
  const result=spawnSync(process.argv[4],process.argv.slice(5),{env:{...cleanEnvironment(),...env,NODE_ENV:context==='production'?'production':context==='test'?'test':'development'},stdio:'inherit'});
  process.exitCode=result.error?2:result.status??2;
 }catch(e){console.error(e.message);process.exitCode=2;}
}
