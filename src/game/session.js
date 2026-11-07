import {validateCatalog,assessPlan,hintFor} from './engine.js';

const LIMIT=90000;
const MAX_ELAPSED=31*24*60*60*1000;
const clone=value=>structuredClone(value);
const requireValue=(condition,message)=>{if(!condition)throw new TypeError(message);};
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const validDate=value=>typeof value==='string'&&value.length<=32&&Number.isFinite(Date.parse(value));
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(value);
const cardId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(value);
const inactive=message=>({correct:false,message,expected:undefined,actual:undefined,trace:[],code:''});

/** Validate without normalizing or changing the caller's retained saved bytes. */
export function validateSnapshot(value,catalog) {
  requireValue(value!==null&&typeof value==='object'&&!Array.isArray(value),'저장된 진행 형식이 올바르지 않습니다.');
  requireValue(value.schema===1&&value.catalogId==='pipe-rush-v1','지원하지 않는 저장 버전입니다. 원본 저장은 유지합니다.');
  requireValue(identifier(value.runId),'저장된 실행 ID가 올바르지 않습니다.');
  requireValue(['challenge','practice'].includes(value.mode),'저장된 모드가 올바르지 않습니다.');
  requireValue(integer(value.index,0,7),'저장된 라운드가 올바르지 않습니다.');
  requireValue(finite(value.remainingMs,0,LIMIT)&&finite(value.elapsedMs,0,MAX_ELAPSED),'저장된 시간이 올바르지 않습니다.');
  requireValue(integer(value.score,0,100000000)&&integer(value.combo,0,8)&&integer(value.maxCombo,0,8),'저장된 점수가 올바르지 않습니다.');
  requireValue(value.combo<=value.maxCombo,'저장된 콤보가 올바르지 않습니다.');
  requireValue(integer(value.solved,0,8)&&value.maxCombo<=value.solved,'저장된 해결 수가 올바르지 않습니다.');
  requireValue(['editing','cleared','finished'].includes(value.phase)&&typeof value.keepLoop==='boolean','저장된 단계 상태가 올바르지 않습니다.');
  requireValue(Array.isArray(value.plan)&&value.plan.length<=12&&value.plan.every(cardId)&&new Set(value.plan).size===value.plan.length,'저장된 카드 목록이 올바르지 않습니다.');
  requireValue(value.selected===null||cardId(value.selected),'저장된 선택 카드가 올바르지 않습니다.');
  if(value.startedAt!==undefined)requireValue(validDate(value.startedAt),'저장된 시작 날짜가 올바르지 않습니다.');
  if(value.finishedAt!==undefined&&value.finishedAt!==null)requireValue(validDate(value.finishedAt),'저장된 종료 날짜가 올바르지 않습니다.');
  requireValue(value.phase==='finished'||!value.finishedAt,'진행 중인 저장에 종료 날짜가 있습니다.');
  requireValue(value.mode!=='practice'||value.remainingMs===LIMIT,'연습 모드의 시간이 올바르지 않습니다.');
  requireValue(value.mode!=='challenge'||value.remainingMs<=Math.max(0,LIMIT-value.elapsedMs),'저장된 도전 시간이 경과 시간보다 큽니다.');
  if(value.phase==='editing')requireValue(value.solved===value.index&&value.remainingMs>0&&!value.keepLoop,'편집 중인 라운드와 해결 수가 다릅니다.');
  if(value.phase==='cleared')requireValue(value.solved===value.index+1&&value.remainingMs>0,'완료한 라운드와 해결 수가 다릅니다.');
  if(value.phase==='finished') {
    const complete=value.index===7&&value.solved===8;
    const timeout=value.mode==='challenge'&&value.remainingMs===0&&[value.index,value.index+1].includes(value.solved);
    requireValue(complete||timeout,'종료 조건이 없는 저장입니다.');
  }
  if(value.solved===0)requireValue(value.score===0&&value.combo===0&&value.maxCombo===0,'해결하지 않은 진행에 점수가 있습니다.');
  if(catalog) {
    requireValue(catalog.id===value.catalogId&&catalog.levels?.length===8,'저장과 현재 라운드 묶음이 다릅니다.');
    const level=catalog.levels[value.index];
    const known=new Set(level.ops.map(op=>op.id));
    requireValue(value.plan.every(id=>known.has(id))&&(value.selected===null||known.has(value.selected)),'저장에 현재 라운드의 카드가 아닌 값이 있습니다.');
    requireValue(!value.keepLoop||level.keepLoop,'이 라운드에서 반복문 유지 상태는 유효하지 않습니다.');
    const currentCleared=value.phase==='cleared'||(value.phase==='finished'&&value.solved===value.index+1);
    if(currentCleared)requireValue(assessPlan(level,value.plan,{keepLoop:value.keepLoop}).correct,'저장된 완료 라운드의 실제 결과가 맞지 않습니다.');
  }
  return value;
}

export class GameSession {
  #catalog; #state; #now; #lastTime; #paused=false; #lastResult=null;
  constructor({catalog,mode='challenge',snapshot=null,now=()=>performance.now()}) {
    validateCatalog(catalog);
    requireValue(typeof now==='function','시계 함수가 필요합니다.');
    this.#catalog=clone(catalog);this.#now=now;
    if(snapshot!==null) {
      validateSnapshot(snapshot,this.#catalog);
      this.#state=clone(snapshot);this.#paused=true;
      this.#state.startedAt??=new Date().toISOString();
      if(this.#state.phase==='finished')this.#state.finishedAt??=this.#state.startedAt;
      if(this.#state.phase==='cleared')this.#lastResult=assessPlan(this.level,this.#state.plan,{keepLoop:this.#state.keepLoop});
    } else {
      requireValue(['challenge','practice'].includes(mode),'지원하지 않는 게임 모드입니다.');
      const runId=globalThis.crypto?.randomUUID?.()??`pipe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,12)}`;
      this.#state={schema:1,catalogId:catalog.id,runId,mode,index:0,remainingMs:LIMIT,elapsedMs:0,score:0,combo:0,maxCombo:0,solved:0,plan:[],selected:null,phase:'editing',keepLoop:false,startedAt:new Date().toISOString(),finishedAt:null};
    }
    this.#lastTime=this.#readTime();
  }
  #readTime(){const value=this.#now();requireValue(typeof value==='number'&&Number.isFinite(value),'단조 시계 값이 올바르지 않습니다.');return value;}
  get level(){return clone(this.#catalog.levels[this.#state.index]);}
  get state(){return clone(this.#state);}
  get paused(){return this.#paused;}
  get finished(){return this.#state.phase==='finished';}
  get lastResult(){return this.#lastResult?clone(this.#lastResult):null;}
  #finish(){if(!this.finished){this.#state.phase='finished';this.#state.finishedAt=new Date().toISOString();}}
  tick() {
    const time=this.#readTime();
    const delta=Math.max(0,time-this.#lastTime);
    this.#lastTime=Math.max(this.#lastTime,time);
    if(!this.#paused&&!this.finished) {
      const active=this.#state.mode==='challenge'?Math.min(delta,this.#state.remainingMs):Math.min(delta,MAX_ELAPSED-this.#state.elapsedMs);
      this.#state.elapsedMs=Math.min(MAX_ELAPSED,this.#state.elapsedMs+active);
      if(this.#state.mode==='challenge') {
        this.#state.remainingMs=Math.max(0,this.#state.remainingMs-active);
        if(this.#state.remainingMs===0)this.#finish();
      }
    }
    return this.state;
  }
  #editable(){this.tick();return !this.#paused&&!this.finished&&this.#state.phase==='editing';}
  #known(id){return this.#catalog.levels[this.#state.index].ops.some(op=>op.id===id);}
  select(id){if(!this.#editable()||!this.#known(id))return false;this.#state.selected=id;return true;}
  place(id,index=this.#state.plan.length) {
    if(!this.#editable()||!this.#known(id)||!integer(index,0,this.#state.plan.length)||this.#state.plan.includes(id))return false;
    this.#state.plan.splice(index,0,id);this.#state.selected=id;this.#lastResult=null;return true;
  }
  remove(index){if(!this.#editable()||!integer(index,0,this.#state.plan.length-1))return false;this.#state.plan.splice(index,1);this.#lastResult=null;return true;}
  move(from,to) {
    if(!this.#editable()||!integer(from,0,this.#state.plan.length-1)||!integer(to,0,this.#state.plan.length-1))return false;
    const [id]=this.#state.plan.splice(from,1);this.#state.plan.splice(to,0,id);this.#lastResult=null;return true;
  }
  reset(){if(!this.#editable())return false;this.#state.plan=[];this.#state.selected=null;this.#state.keepLoop=false;this.#lastResult=null;return true;}
  #penalty() {
    this.#state.combo=0;
    if(this.#state.mode==='challenge'){this.#state.remainingMs=Math.max(0,this.#state.remainingMs-5000);if(this.#state.remainingMs===0)this.#finish();}
  }
  check({keepLoop=false}={}) {
    if(!this.#editable())return this.#state.phase==='cleared'&&this.#lastResult?this.lastResult:inactive(this.#paused?'일시 정지를 해제한 뒤 실행하세요.':'이 라운드는 실행을 마쳤습니다.');
    const result=assessPlan(this.level,this.#state.plan,{keepLoop});
    this.#lastResult=result;
    if(result.correct) {
      this.#state.keepLoop=keepLoop;this.#state.phase='cleared';this.#state.solved++;
      this.#state.combo++;this.#state.maxCombo=Math.max(this.#state.maxCombo,this.#state.combo);
      this.#state.score+=1000+this.#state.combo*100;
    } else this.#penalty();
    return clone(result);
  }
  advance() {
    this.tick();
    if(this.#paused||this.finished||this.#state.phase!=='cleared')return false;
    if(this.#state.index===this.#catalog.levels.length-1){this.#finish();return true;}
    this.#state.index++;this.#state.plan=[];this.#state.selected=null;this.#state.keepLoop=false;this.#state.phase='editing';this.#lastResult=null;
    return true;
  }
  hint(){if(!this.#editable())return {message:this.#paused?'일시 정지를 해제한 뒤 힌트를 사용하세요.':'진행 중인 라운드에서 힌트를 사용할 수 있습니다.'};const hint=hintFor(this.level,this.#state.plan);this.#penalty();return hint;}
  pause(){this.tick();this.#paused=true;return this.state;}
  resume(){this.#lastTime=this.#readTime();this.#paused=false;return this.state;}
  snapshot(){this.tick();return this.state;}
  toResult() {
    this.tick();requireValue(this.finished,'게임이 끝난 뒤 기록을 만들 수 있습니다.');
    return {id:this.#state.runId,mode:this.#state.mode,score:this.#state.score,total:8,solved:this.#state.solved,durationMs:this.#state.elapsedMs,maxCombo:this.#state.maxCombo,date:this.#state.finishedAt||this.#state.startedAt||new Date().toISOString()};
  }
}
