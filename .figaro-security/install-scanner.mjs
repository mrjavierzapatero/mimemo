import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,mkdirSync,copyFileSync,chmodSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const VERSION='8.30.1';
export const HASHES={
 darwin_arm64:'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
 darwin_x64:'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
 linux_arm64:'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
 linux_x64:'551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'
};
export function cleanEnvironment(extra={}) {
 const out={};for(const k of ['PATH','HOME','TMPDIR','TMP','TEMP','SystemRoot','LANG','LC_ALL'])if(process.env[k])out[k]=process.env[k];
 return {...out,...extra};
}
export function scannerPath(root) {
 try{
  const result=execFileSync('git',['-C',root,'rev-parse','--path-format=absolute','--git-common-dir'],{encoding:'utf8',env:cleanEnvironment(),stdio:['ignore','pipe','pipe']}).trim();
  return path.join(result,'figaro-security',`gitleaks-${VERSION}`);
 }catch{return path.join(path.dirname(fileURLToPath(import.meta.url)),'bin',`gitleaks-${VERSION}`);}
}
export function install(root=process.cwd()) {
 const platform=`${process.platform}_${process.arch}`;if(!HASHES[platform])throw new Error('Plataforma no soportada por el instalador verificado');
 const target=scannerPath(root);if(existsSync(target)&&execFileSync(target,['version'],{encoding:'utf8',env:cleanEnvironment()}).trim()===VERSION)return target;
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-scanner-'));chmodSync(temp,0o700);
 try {
  const archive=path.join(temp,'release.tar.gz');
  const url=`https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_${platform}.tar.gz`;
  execFileSync('curl',['--fail','--location','--silent','--show-error','--max-time','90','--output',archive,url],{env:cleanEnvironment(),stdio:['ignore','ignore','pipe']});
  if(createHash('sha256').update(readFileSync(archive)).digest('hex')!==HASHES[platform])throw new Error('Hash del escaner incorrecto; no se ejecutara');
  execFileSync('tar',['-xzf',archive,'-C',temp,'gitleaks'],{env:cleanEnvironment(),stdio:'pipe'});
  mkdirSync(path.dirname(target),{recursive:true,mode:0o700});copyFileSync(path.join(temp,'gitleaks'),target);chmodSync(target,0o700);
  if(execFileSync(target,['version'],{encoding:'utf8',env:cleanEnvironment()}).trim()!==VERSION)throw new Error('Version del escaner incorrecta');
  return target;
 } finally {rmSync(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
 try{console.log(install(process.argv[2]||process.cwd()));}catch{console.error('No se pudo instalar el escaner verificado. No se omite el control.');process.exitCode=2;}
}
