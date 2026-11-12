const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('calendar-ui.js','utf8');
const match=source.match(/window\.guardarIdea=async function\(\)\{([\s\S]*?)\n  \};/);
assert(match);
(async()=>{
  let finish,opened=null;
  const input={value:'Mañana enviar email'},pending=new Promise(resolve=>{finish=resolve;});
  let message;
  const ctx={window:{LeteoNativeSpeech:{native:true}},nativeDictatedText:'',nativeDictationInterrupted:false,
    $:()=>input,stopSpeechRecognition:discard=>{assert.equal(discard,false);return pending;},focusInput:()=>{},
    C:{parseMany:require('../calendar.js').parseMany},openBatch:text=>{opened=text;},toast:text=>{message=text;}};
  vm.runInNewContext('window.guardarIdea=async function(){'+match[1]+'\n};',ctx);
  const review=ctx.window.guardarIdea();
  assert.equal(opened,null,'Review must await the transcript even after an early recognizer stop');
  input.value='Mañana enviar email a Ticare a la una';finish();await review;
  assert.equal(opened,input.value);
  opened=null;
  input.value=ctx.nativeDictatedText='quiero que EE';
  await ctx.window.guardarIdea();
  assert.equal(opened,null);
  assert.match(message,/dictado quedó incompleto/);
  assert.equal(input.value,'quiero que EE');
  ctx.nativeDictatedText='';
  input.value='Cita de prueba escrita';
  await ctx.window.guardarIdea();
  assert.equal(opened,input.value);
  console.log('Review waits for the final phrase even after an early recognizer stop.');
})().catch(error=>{console.error(error);process.exitCode=1;});
