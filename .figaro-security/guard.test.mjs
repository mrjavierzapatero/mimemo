import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeText,inspectTree,pushRanges,inspectArtifactValues,checkGovernance,main,reviewHistoryFinding} from './guard.mjs';
import {buildEnvironment} from './with-environment.mjs';
import {cleanEnvironment} from './install-scanner.mjs';
import {mkdtempSync,writeFileSync,mkdirSync,copyFileSync,chmodSync,rmSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
test('public configuration permitted, private and unknown public names rejected',()=>{
 assert.equal(analyzeText('a.ts','process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY').length,0);
 for(const n of ['NEXT_PUBLIC_OPENAI_API_KEY','VITE_SERVICE_ROLE_KEY','NEXT_PUBLIC_NEW_PROVIDER_KEY'])assert.equal(analyzeText('a.ts',`process.env.${n}`).length,1);
 assert.equal(analyzeText('a.ts',"process.env['NEXT_PUBLIC_SERVICE_ROLE_KEY']").length,1);
 assert.equal(analyzeText('a.ts','process.env.OPENAI_API_KEY',{client:false}).length,0);
 assert.equal(analyzeText('a.ts','process.env.OPENAI_API_KEY',{client:true}).length,1);
});
test('client transitive imports, server-only imports and tracked env blocked',()=>{
 const map=new Map([['app/src/a.tsx',"'use client';\nimport {x} from './lib';"],['app/src/lib.ts','export const x = process.env.ANTHROPIC_API_KEY;'],['.env','NOT_A_SECRET=example']]);
 assert.deepEqual(inspectTree(map).map(f=>f.rule).sort(),['operational-env-tracked','private-env-in-client']);
 assert.equal(analyzeText('a.ts',"import 'server-only'",{client:true}).length,1);
 assert.equal(inspectTree(new Map([['.env.example','KEY=placeholder']])).length,0);
});
test('custom public prefixes and next env inlining rejected',()=>{
 assert.equal(analyzeText('vite.config.ts',"export default {envPrefix: 'MY_'}").length,1);
 assert.equal(analyzeText('next.config.js','export default {env:{OPENAI_API_KEY:process.env.OPENAI_API_KEY}}').length,1);
 assert.equal(analyzeText('next.config.js','export default {env:{...process.env}}').length,1);
});
test('all pushed refs covered, deletion skipped and invalid input rejected',()=>{
 const a='a'.repeat(40),b='b'.repeat(40),z='0'.repeat(40);
 assert.deepEqual(pushRanges(`refs/heads/a ${a} refs/heads/a ${b}\nrefs/heads/b ${a} refs/heads/b ${z}\nrefs/heads/c ${z} refs/heads/c ${b}`),[`${b}..${a}`,a]);
 assert.throws(()=>pushRanges('refs/heads/a --all refs/heads/a bad'));
});
test('reviewed non-secret finding cannot exempt staged code or another commit',()=>{
 const f={commit:'a'.repeat(40),file:'a.js',line:3,rule:'generic-api-key'};const entries=[{...f,reason:'Identificador de almacenamiento, no una credencial',reviewedAt:'2026-10-23'}];
 assert(reviewHistoryFinding(f,entries));assert(!reviewHistoryFinding({...f,commit:undefined},entries));assert(!reviewHistoryFinding({...f,commit:'b'.repeat(40)},entries));assert(!reviewHistoryFinding({...f,line:4},entries));
});
test('artifact values redacted including encoded representation',()=>{
 const value=randomBytes(20).toString('hex');const env={OPENAI_API_KEY:value,NEXT_PUBLIC_SUPABASE_ANON_KEY:'public'};
 for(const text of [value,Buffer.from(value).toString('base64')]){
  const result=inspectArtifactValues('public/a.js',text,env);assert.equal(result.length,1);assert(!JSON.stringify(result).includes(value));
 }
});
test('browser export scanning does not expose private runtime values in its receipt',()=>{
 const secret=randomBytes(20).toString('hex');
 const result=inspectArtifactValues('dist/bundle.js',`window.config="${encodeURIComponent(secret)}"`,{STRIPE_SECRET_KEY:secret});
 assert.equal(result[0].rule,'private-runtime-value-in-browser');assert(!JSON.stringify(result).includes(secret));
});
test('least privilege fails closed and wrapper does not forward unrelated secrets',()=>{
 assert.equal(checkGovernance({}).length,3);
 const context={status:'verified',storeReference:'provider/reference-only',principalReference:'test-reader',permissionEvidence:'private-evidence-reference',verifiedAt:'2026-10-23',minimumPrivileges:true,noProductionInTests:true,variables:['TEST_API_KEY']};
 const p={environments:{test:context}};
 assert.deepEqual(buildEnvironment(p,'test',{TEST_API_KEY:'synthetic',UNRELATED_SECRET:'not-forwarded'}),{TEST_API_KEY:'synthetic'});
 assert.throws(()=>buildEnvironment(p,'production',{}));
 assert.throws(()=>buildEnvironment({environments:{test:{...context,variables:['NODE_OPTIONS']}}},'test',{NODE_OPTIONS:'unsafe'}));
 assert.throws(()=>buildEnvironment({environments:{test:{...context,variables:['PROD_API_SECRET']}}},'test',{PROD_API_SECRET:'synthetic'}));
});
test('scanner env drops inherited bypasses, app keys and runtime injection',()=>{
 process.env.GITLEAKS_CONFIG_TOML='bypass';process.env.NODE_OPTIONS='';process.env.FIGARO_TEST_SECRET='synthetic';
 const env=cleanEnvironment();assert(!('GITLEAKS_CONFIG_TOML'in env));assert(!('NODE_OPTIONS'in env));assert(!('FIGARO_TEST_SECRET'in env));
 delete process.env.GITLEAKS_CONFIG_TOML;delete process.env.FIGARO_TEST_SECRET;
});
const binary=process.env.FIGARO_TEST_SCANNER;
test('CLI invoked through a symlink still executes and blocks an invalid mode',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-cli-alias-'));
 try{const alias=path.join(temp,'guard.mjs');symlinkSync(new URL('./guard.mjs',import.meta.url).pathname,alias);const r=spawnSync(process.execPath,[alias,'invalid-mode'],{encoding:'utf8'});assert.equal(r.status,2);assert(r.stderr.includes('blocked'));}finally{rmSync(temp,{recursive:true,force:true});}
});
test('real scanner blocks staged secret without printing it; unstaged replacement cannot hide index', {skip:!binary},()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-guard-integration-'));chmodSync(temp,0o700);
 const git=a=>execFileSync('git',['-C',temp,...a],{env:cleanEnvironment(),stdio:'pipe'});
 try{
  git(['init','-q']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
  mkdirSync(path.join(temp,'.git/figaro-security'),{recursive:true});copyFileSync(binary,path.join(temp,'.git/figaro-security/gitleaks-8.30.1'));chmodSync(path.join(temp,'.git/figaro-security/gitleaks-8.30.1'),0o700);
  const secret=['gh','p_'].join('')+randomBytes(32).toString('hex').slice(0,36);
  writeFileSync(path.join(temp,'a.js'),`const token = "${secret}";\n`);git(['add','a.js']);
  writeFileSync(path.join(temp,'a.js'),'const token = "placeholder";\n');
  const result=main('staged',temp);assert(result.findings.length>0);assert(!JSON.stringify(result).includes(secret));
  git(['add','a.js']);assert.equal(main('staged',temp).findings.length,0);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('real scanner detects history, empty history fails, scanner missing fails', {skip:!binary},()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-history-fixture-'));chmodSync(temp,0o700);const git=a=>execFileSync('git',['-C',temp,...a],{env:cleanEnvironment(),stdio:'pipe'});
 try{
  git(['init','-q']);assert.throws(()=>main('staged',temp));
  git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);mkdirSync(path.join(temp,'.git/figaro-security'),{recursive:true});copyFileSync(binary,path.join(temp,'.git/figaro-security/gitleaks-8.30.1'));chmodSync(path.join(temp,'.git/figaro-security/gitleaks-8.30.1'),0o700);
  assert.throws(()=>main('history',temp));
  const secret=['gh','p_'].join('')+randomBytes(32).toString('hex').slice(0,36);writeFileSync(path.join(temp,'a.js'),`const token = "${secret}";`);git(['add','a.js']);git(['commit','-qm','fixture']);
  writeFileSync(path.join(temp,'a.js'),'const token = "placeholder";');git(['add','a.js']);git(['commit','-qm','remove']);
  const result=main('history',temp);assert(result.findings.length>0);assert(!JSON.stringify(result).includes(secret));
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('actual pre-push hook rejects an outgoing historical secret without network', {skip:!binary},()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'figaro-push-fixture-'));chmodSync(temp,0o700);const repo=path.join(temp,'repo'),remote=path.join(temp,'remote.git');mkdirSync(repo);
 const git=(args)=>execFileSync('git',['-C',repo,...args],{env:cleanEnvironment(),stdio:'pipe'});
 try{
  git(['init','-q']);execFileSync('git',['init','--bare','-q',remote],{stdio:'pipe'});git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);
  const secret=['gh','p_'].join('')+randomBytes(32).toString('hex').slice(0,36);writeFileSync(path.join(repo,'a.js'),`const token="${secret}";`);git(['add','a.js']);git(['commit','-qm','fixture']);
  mkdirSync(path.join(repo,'.git/figaro-security'),{recursive:true});copyFileSync(binary,path.join(repo,'.git/figaro-security/gitleaks-8.30.1'));chmodSync(path.join(repo,'.git/figaro-security/gitleaks-8.30.1'),0o700);
  const hook=path.join(repo,'.git/hooks/pre-push');writeFileSync(hook,`#!/bin/sh\nexec node "${new URL('./guard.mjs',import.meta.url).pathname}" push\n`);chmodSync(hook,0o700);git(['remote','add','origin',remote]);
  const result=spawnSync('git',['-C',repo,'push','origin','HEAD:refs/heads/main'],{env:cleanEnvironment(),encoding:'utf8'});
  assert.notEqual(result.status,0);assert((result.stdout+result.stderr).includes('findings'));assert(!result.stdout.includes(secret));assert(!result.stderr.includes(secret));
  assert.notEqual(spawnSync('git',['--git-dir',remote,'rev-parse','--verify','refs/heads/main'],{stdio:'pipe'}).status,0);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
