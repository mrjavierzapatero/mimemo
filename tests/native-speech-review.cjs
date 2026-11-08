const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('calendar-ui.js','utf8');
const match=source.match(/window\.guardarIdea=async function\(\)\{([\s\S]*?)\n  \};/);
assert(match);
(async()=>{
  let finish,opened=null;
  const input={value:'Mañana enviar email'},pending=new Promise(resolve=>{finish=resolve;});
  const ctx={window:{LeteoNativeSpeech:{native:true}},keepListening:false,nativeStopPromise:pending,
    $:()=>input,stopSpeechRecognition:()=>pending,focusInput:()=>{},
    C:{parseMany:text=>({entries:[{title:text}]})},openBatch:text=>{opened=text;}};
  vm.runInNewContext('window.guardarIdea=async function(){'+match[1]+'\n};',ctx);
  const review=ctx.window.guardarIdea();
  assert.equal(opened,null,'Review must wait even when the user already pressed Stop');
  input.value='Mañana enviar email a Ticare a la una';finish();await review;
  assert.equal(opened,input.value);
  console.log('Review waits for the final phrase after manual Stop.');
})().catch(error=>{console.error(error);process.exitCode=1;});
