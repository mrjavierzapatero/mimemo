import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../android-app/src/speech.mjs',import.meta.url),'utf8').replace(/^import .*;\n/m,'');
function harness(){
  const listeners=new Map(),received=[];
  let completeStop,starts=0;
  const plugin={
    requestPermissions:async()=>({microphone:'granted'}),
    addListener:async(name,fn)=>{listeners.set(name,fn);return {remove:async()=>listeners.delete(name)};},
    start:async()=>{starts++;listeners.get('listeningState')?.({status:'started'});},
    stop:()=>new Promise(resolve=>{completeStop=resolve;})
  };
  const context={Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},registerPlugin:()=>plugin,window:{},console};
  vm.runInNewContext(source,context);
  return {api:context.window.LeteoNativeSpeech,received,plugin,
    emit:(name,data)=>listeners.get(name)?.(data),
    finish:text=>completeStop({text}),starts:()=>starts};
}
const a=harness();
await a.api.start({onText:t=>a.received.push(t)});
a.emit('partialResults',{text:'mañana enviar un correo'});
const pending=a.api.stop();
a.emit('partialResults',{text:'mañana enviar un correo a Ticare a la una'});
a.finish('mañana enviar un correo a Ticare a la una');
await pending;
assert.equal(a.received.at(-1),'mañana enviar un correo a Ticare a la una');
assert.equal(a.starts(),1);
const b=harness();
await b.api.start({onText:t=>b.received.push(t)});
const discarded=b.api.stop(true);
b.emit('partialResults',{text:'texto que ya no debe reaparecer'});
b.finish('texto que ya no debe reaparecer');await discarded;
assert.equal(b.received.length,0);
console.log('Native bridge: final phrase retained before review; discard suppresses late results.');
