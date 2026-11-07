import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GameSession,validateSnapshot } from '../src/game/session.js';

const catalog=JSON.parse(await readFile(new URL('../data/levels.json',import.meta.url),'utf8'));
function clockSession(mode='challenge') {let time=0;const game=new GameSession({catalog,mode,now:()=>time});return {game,add:ms=>time+=ms};}
function solve(game) {for(const id of game.level.solution)game.place(id);return game.check({keepLoop:game.level.keepLoop});}

test('clock uses active monotonic deltas and pause prevents hidden-time penalties',()=>{
  const {game,add}=clockSession();add(1250);game.tick();assert.equal(game.state.remainingMs,88750);assert.equal(game.state.elapsedMs,1250);
  game.pause();add(50000);game.tick();assert.equal(game.state.remainingMs,88750);
  game.resume();add(750);game.tick();assert.equal(game.state.remainingMs,88000);assert.equal(game.state.elapsedMs,2000);
});
test('clock ignores backward time without counting recovered time twice',()=>{
  const {game,add}=clockSession();add(1000);game.tick();add(-500);game.tick();add(800);game.tick();assert.equal(game.state.elapsedMs,1300);
});
test('wrong answers and hints cost five seconds and reset combo',()=>{
  const {game}=clockSession();assert.equal(game.check().correct,false);assert.equal(game.state.remainingMs,85000);
  const hint=game.hint();assert.equal(typeof hint.message,'string');assert.equal(game.state.remainingMs,80000);
  solve(game);game.advance();assert.equal(game.state.combo,1);game.check();assert.equal(game.state.combo,0);
});
test('practice records active time but never loses time to actions or clock',()=>{
  const {game,add}=clockSession('practice');add(150000);game.tick();game.check();game.hint();assert.equal(game.finished,false);assert.equal(game.state.remainingMs,90000);assert.equal(game.state.elapsedMs,150000);
});
test('successful check scores once and cleared editing/duplicate advance cannot skip a stage',()=>{
  const {game}=clockSession();solve(game);const score=game.state.score;
  assert.ok(score>0);assert.equal(game.state.solved,1);assert.equal(game.state.phase,'cleared');
  game.check();game.place('paid');game.remove(0);game.reset();assert.equal(game.state.score,score);assert.deepEqual(game.state.plan,['paid']);
  game.advance();assert.equal(game.state.index,1);game.advance();assert.equal(game.state.index,1);assert.equal(game.state.phase,'editing');
});
test('select place remove move and reset enforce operation identity without duplicates',()=>{
  const {game}=clockSession('practice');solve(game);game.advance();solve(game);game.advance();
  game.select('customer');assert.equal(game.state.selected,'customer');game.place('customer');game.place('paid',0);assert.deepEqual(game.state.plan,['paid','customer']);
  game.move(1,0);assert.deepEqual(game.state.plan,['customer','paid']);game.remove(0);assert.deepEqual(game.state.plan,['paid']);
  game.place('paid');assert.deepEqual(game.state.plan,['paid']);game.place('alien');assert.deepEqual(game.state.plan,['paid']);
  game.reset();assert.deepEqual(game.state.plan,[]);assert.equal(game.state.selected,null);
});
test('paused actions do not mutate plans, scores or penalties',()=>{
  const {game}=clockSession();game.pause();const before=game.snapshot();game.select('paid');game.place('paid');game.check();game.hint();game.reset();game.advance();assert.deepEqual(game.snapshot(),before);
});
test('timeout from clock or penalty finishes once and blocks late score',()=>{
  const {game,add}=clockSession();game.place('paid');add(90000);const result=game.check();assert.equal(game.finished,true);assert.equal(game.state.score,0);assert.equal(result.correct,false);assert.equal(game.state.remainingMs,0);
  const second=clockSession();second.add(86000);second.game.hint();assert.equal(second.game.finished,true);assert.equal(second.game.state.elapsedMs,86000);assert.equal(second.game.state.remainingMs,0);
});
test('restore starts paused and resumes a coherent cleared round only after validation',()=>{
  const {game,add}=clockSession();add(2000);solve(game);const saved=game.snapshot();
  assert.equal(validateSnapshot(saved,catalog),saved);
  const resumed=new GameSession({catalog,snapshot:saved,now:()=>50000});assert.equal(resumed.paused,true);assert.equal(resumed.state.phase,'cleared');
  resumed.advance();assert.equal(resumed.state.index,0);resumed.resume();resumed.advance();assert.equal(resumed.state.index,1);
  assert.deepEqual(saved,game.snapshot());
});
test('incompatible or fabricated saved progress is rejected without modifying bytes',()=>{
  const {game}=clockSession();const saved=game.snapshot();
  const rejects=change=>{const value=structuredClone(saved);change(value);const before=JSON.stringify(value);assert.throws(()=>validateSnapshot(value,catalog));assert.equal(JSON.stringify(value),before);assert.throws(()=>new GameSession({catalog,snapshot:value}));};
  rejects(s=>s.schema=2);rejects(s=>s.catalogId='other');rejects(s=>s.index=8);rejects(s=>s.remainingMs=-1);rejects(s=>s.elapsedMs=NaN);rejects(s=>s.plan=['unknown']);rejects(s=>s.plan=['paid','paid']);
  rejects(s=>s.selected='unknown');rejects(s=>s.solved=7);rejects(s=>s.phase='cleared');rejects(s=>s.keepLoop=true);rejects(s=>s.score=Infinity);
  rejects(s=>{s.phase='cleared';s.solved=1;s.plan=[];s.score=100;});
});
test('full eight-round practice produces stable result identity and solved count',()=>{
  const {game,add}=clockSession('practice');for(let i=0;i<8;i++){add(1000);assert.equal(solve(game).correct,true);game.advance();}
  assert.equal(game.finished,true);assert.equal(game.state.solved,8);assert.equal(game.state.maxCombo,8);
  const result=game.toResult();assert.equal(result.total,8);assert.equal(result.solved,8);assert.equal(result.durationMs,8000);assert.equal(result.id,game.state.runId);
  game.advance();game.check();assert.deepEqual(game.toResult(),result);
  const snapshot=game.snapshot();assert.equal(validateSnapshot(snapshot,catalog),snapshot);
});
test('state and snapshot are defensive copies and invalid modes fail clearly',()=>{
  const {game}=clockSession();const state=game.state;state.plan.push('alien');state.score=9000;assert.deepEqual(game.state.plan,[]);assert.equal(game.state.score,0);
  assert.throws(()=>new GameSession({catalog,mode:'speed'}));assert.throws(()=>game.toResult());
});

test('spec-only snapshots accept short identity but reject invalid card syntax without catalog',()=>{
  const {game}=clockSession();const snapshot=game.snapshot();snapshot.runId='run-one';assert.equal(validateSnapshot(snapshot),snapshot);
  assert.throws(()=>validateSnapshot({...snapshot,plan:['<script>']}));
  assert.throws(()=>validateSnapshot({...snapshot,selected:'<script>'}));
});

test('finishing from a cleared-round timeout retains a valid cleared proof',()=>{
  const {game,add}=clockSession();solve(game);add(90000);game.tick();assert.equal(game.finished,true);assert.equal(game.state.solved,1);
  const snapshot=game.snapshot();assert.equal(validateSnapshot(snapshot,catalog),snapshot);
  const tampered=structuredClone(snapshot);tampered.plan=[];assert.throws(()=>validateSnapshot(tampered,catalog));
});

test('finished DTO without optional dates gets a stable result date on restore',()=>{
  const {game,add}=clockSession();add(90000);game.tick();const snapshot=game.snapshot();delete snapshot.startedAt;delete snapshot.finishedAt;
  const resumed=new GameSession({catalog,snapshot});const result=resumed.toResult();assert.equal(typeof resumed.state.finishedAt,'string');assert.deepEqual(resumed.toResult(),result);
});
