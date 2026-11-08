import assert from 'node:assert/strict';
import { textFromSpeechEvent, keepLongerPartial } from '../android-app/src/speech-events.mjs';

const initial=textFromSpeechEvent({matches:['quiero que guardes']});
assert.deepEqual(initial,{text:'quiero que guardes',final:false});
assert.deepEqual(textFromSpeechEvent({matches:['quiero que guardes'],accumulated:'quiero que guardes',isRestarting:true}),{text:'quiero que guardes',final:true});
assert.deepEqual(textFromSpeechEvent({matches:['una alarma'],accumulated:'quiero que guardes'}),{text:'quiero que guardes una alarma',final:false});
assert.deepEqual(textFromSpeechEvent({matches:['una alarma'],accumulatedText:'quiero que guardes una alarma'}),{text:'quiero que guardes una alarma',final:true});
assert(keepLongerPartial('quiero que guardes','quiero'));
assert(!keepLongerPartial('quiero que guardes','quiero que guardes una alarma'));
console.log('Android speech events: accumulated segments retained across recognizer restarts.');
