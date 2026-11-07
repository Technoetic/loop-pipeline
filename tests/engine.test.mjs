import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalog, validateLevel, runReference, runPipeline, assessPlan, pipelineCode, hintFor } from '../src/game/engine.js';

const catalog = JSON.parse(await readFile(new URL('../data/levels.json', import.meta.url), 'utf8'));
const levels = catalog.levels;

test('catalog validates eight executable coffee missions', () => {
  assert.equal(validateCatalog(catalog), catalog);
  assert.equal(levels.length, 8);
  for (const level of levels) {
    assert.equal(validateLevel(level), level);
    assert.equal(assessPlan(level, level.solution, {keepLoop:level.keepLoop}).correct, true, level.id);
  }
});

test('all solutions produce independently hand calculated outputs including state', () => {
  const expected = [
    [{id:'a',menu:'아메리카노',customer:'민',paid:true,cancelled:false,price:3000,quantity:2},{id:'c',menu:'아메리카노',customer:'민',paid:true,cancelled:true,price:3000,quantity:1}],
    ['아메리카노','라테','아메리카노'], ['민','민'], [6000,4500,3000], 13500, 10500,
    [{id:'b',amount:5600},{id:'c',amount:5000}], {accepted:['a'],remaining:1}
  ];
  levels.forEach((level, index) => assert.deepEqual(runReference(level).output, expected[index], level.id));
  levels.slice(0,7).forEach((level,index) => assert.deepEqual(runPipeline(level,level.solution).output,expected[index]));
});

test('filter and map preserve duplicate order without mutating input', () => {
  const row = {id:'x',menu:'같음',customer:'동일',paid:true,cancelled:false,price:2000,quantity:2};
  const input = [row,{...row,id:'y'},{...row,id:'z',paid:false}];
  const before = structuredClone(input);
  assert.deepEqual(runPipeline(levels[1],['menu'],input).output,['같음','같음','같음']);
  assert.deepEqual(runPipeline(levels[2],['paid','customer'],input).output,['동일','동일']);
  assert.deepEqual(input,before);
});

test('empty samples preserve empty lists and sum has explicit zero identity', () => {
  for (const level of levels.slice(0,7)) {
    const expected = [4,5].includes(levels.indexOf(level)) ? 0 : [];
    assert.deepEqual(runPipeline(level,level.solution,[]).output,expected);
  }
  assert.deepEqual(runReference(levels[7],[]).output,{accepted:[],remaining:3});
});

test('assessment executes all cases and exposes a real order-sensitive counterexample', () => {
  const level = structuredClone(levels[6]);
  level.input = [{id:'safe',amount:10000}];
  level.cases = [[],[{id:'edge',amount:5000}]];
  const result = assessPlan(level,['threshold','discount']);
  assert.equal(result.correct,false);
  assert.deepEqual(result.counterexample.input,[{id:'edge',amount:5000}]);
  assert.deepEqual(result.counterexample.expected,[]);
  assert.deepEqual(result.counterexample.actual,[{id:'edge',amount:4000}]);
  assert.ok(result.trace.length);
});

test('equivalent finite operation behavior is accepted without solution-array matching', () => {
  const level = structuredClone(levels[0]);
  level.ops.push({id:'paid-again',kind:'filter',label:'재확인',description:'결제 완료',code:'.filter(order => order.paid)',action:'paid'});
  assert.equal(assessPlan(level,['paid','paid-again']).correct,true);
});

test('unknown, repeated and shape-invalid operations fail gracefully with trace', () => {
  for (const plan of [['missing'],['amount','amount'],['sum'],['amount','sum','amount']]) {
    const result = runPipeline(levels[4],plan);
    assert.equal(typeof result.error,'string');
    assert.equal(assessPlan(levels[4],plan).correct,false);
  }
  const mixed = runPipeline(levels[4],['sum'],[3,'4']);
  assert.equal(typeof mixed.error,'string');
  assert.ok(Array.isArray(mixed.trace));
});

test('stateful inventory is accepted only with keep-loop and emits sequential trace', () => {
  const level=levels[7];
  assert.deepEqual(runReference(level,[{id:'x',quantity:2},{id:'y',quantity:2},{id:'z',quantity:1}]).output,{accepted:['x','z'],remaining:0});
  assert.equal(assessPlan(level,['stock-check']).correct,false);
  assert.equal(assessPlan(level,[],{keepLoop:true}).correct,true);
  assert.equal(assessPlan(levels[0],[],{keepLoop:true}).correct,false);
  assert.ok(runReference(level).trace.some(step => step.remaining === 1));
});

test('keep-loop selection cannot bypass unknown cards or boolean validation',()=>{
  assert.equal(assessPlan(levels[7],['alien'],{keepLoop:true}).correct,false);
  assert.equal(assessPlan(levels[7],['ids','ids'],{keepLoop:true}).correct,false);
  assert.equal(assessPlan(levels[7],[],{keepLoop:'yes'}).correct,false);
});

test('catalog rejects executable text, duplicate identities and malformed values', () => {
  const mutate = callback => {const value=structuredClone(catalog);callback(value);return value;};
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[0].ops[0].action='eval')));
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[1].id=c.levels[0].id)));
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[0].ops[0].kind='map')));
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[0].input[0].price=Infinity)));
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[0].solution=['missing'])));
  assert.throws(()=>validateCatalog(mutate(c=>c.levels[0].input=[{secret:{deep:'object'}}])));
  assert.throws(()=>validateCatalog({...catalog,schema:2}));
});

test('generated code and hints identify the next operation without executing code text', () => {
  const level=structuredClone(levels[4]);
  level.ops.find(op=>op.id==='sum').code='.reduce((total, amount) => total + amount, 0)';
  assert.match(pipelineCode(level,['amount','sum']),/reduce.*0\)/s);
  assert.equal(hintFor(level,['amount']).operatorId,'sum');
  assert.match(hintFor(levels[7],[]).message,/반복문|재고/);
  assert.throws(()=>pipelineCode(level,['missing']));
  level.ops.find(op=>op.id==='sum').code='throw new Error("display only")';
  assert.equal(runPipeline(level,['amount','sum']).output,13500);
});
