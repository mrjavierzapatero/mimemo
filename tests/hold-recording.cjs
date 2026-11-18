const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const binding=html.match(/function bindDictationButton\(button\)\{[\s\S]*?\n\}\nbindDictationButton/)[0].replace(/\nbindDictationButton$/,'');
// Use a single VM global for the recognizer flag, as the page does.
function scenario(end){
 const handlers=new Map(),globalHandlers=new Map(),classes=new Set();let starts=0,stops=0;
 const button={disabled:false,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},setPointerCapture:()=>{},addEventListener:(n,f)=>handlers.set(n,f)};
 const ctx={button,keepListening:false,window:{addEventListener:(n,f)=>globalHandlers.set('window:'+n,f)},document:{hidden:false,addEventListener:(n,f)=>globalHandlers.set(n,f)}};
 ctx.toggleMic=()=>{starts++;ctx.keepListening=true;};ctx.stopSpeechRecognition=()=>{stops++;ctx.keepListening=false;};
 vm.runInNewContext(binding+'\nbindDictationButton(button);',ctx);
 const fire=(n,p={})=>handlers.get(n)?.({preventDefault(){},isPrimary:true,button:0,pointerId:7,...p});
 fire('pointerdown');assert(classes.has('is-held'));fire('pointerdown');fire('pointerup',{pointerId:8});assert.equal(stops,0);
 if(end==='blur')globalHandlers.get('window:blur')();
 else if(end==='hidden'){ctx.document.hidden=true;globalHandlers.get('visibilitychange')();}
 else fire(end);
 assert.equal(starts,1);assert.equal(stops,1);assert(!classes.has('is-held'));
 fire('lostpointercapture');assert.equal(stops,1,'Release and lost capture must not finish twice');
}
for(const end of ['pointerup','pointercancel','lostpointercapture','blur','hidden'])scenario(end);
console.log('Hold recording: one session per press; release, cancellation and backgrounding stop once and clear the pressed appearance.');
