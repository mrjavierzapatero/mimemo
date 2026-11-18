const assert=require('node:assert/strict');
const {paths}=require('../waveform.js');
const quiet=paths(0,0),loud=paths(1,1);
assert.equal(quiet.length,3);
for(const path of [...quiet,...loud]){
  assert(path.startsWith('M0 52 Q'));
  assert(path.endsWith('Q0 52 0 52 Z'));
}
assert.notEqual(loud[0],quiet[0]);
const ys=path=>(path.match(/-?\d+(?:\.\d+)?/g)||[]).map(Number).filter((_,i)=>i%2===1);
assert(Math.min(...ys(loud[0]))<Math.min(...ys(quiet[0])));
assert(Math.max(...ys(loud[0]))>Math.max(...ys(quiet[0])));
assert.notEqual(loud[0],loud[1]);
console.log('Waveform: joined horizon endpoints and independent voice-responsive contours.');
