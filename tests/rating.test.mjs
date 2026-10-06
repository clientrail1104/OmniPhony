import {test} from 'node:test';import assert from 'node:assert/strict';import {quote} from '../apps/api/src/rating.mjs';
const r={initialSeconds:30,incrementSeconds:6,connectFee:'0.02',perMinute:'0.18'};
test('30/6 boundary and exact cost',()=>{assert.deepEqual(quote(r,31001),{durationMs:31001,billableMs:36000,amount:'0.128000'});});
test('unanswered has no charge',()=>assert.equal(quote(r,0,false).amount,'0.000000'));
test('invalid duration',()=>assert.throws(()=>quote(r,-1)));
test('micro-unit half-up rounding',()=>assert.equal(quote({...r,initialSeconds:1,incrementSeconds:1,connectFee:'0',perMinute:'0.000030'},1).amount,'0.000001'));
