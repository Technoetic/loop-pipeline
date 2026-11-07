import {runReference,pipelineCode} from '../game/engine.js';
import {GameSession} from '../game/session.js';

const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;};
const json=value=>JSON.stringify(value,null,2)??'—';
const clone=value=>JSON.parse(JSON.stringify(value));
const RESULT_KEY='pipe-rush:last-result';
const kindLabel={filter:'고르기',map:'바꾸기',reduce:'합치기'};

export class GameScreen {
  constructor(ctx,root,route){Object.assign(this,{ctx,root,route});this.abort=new AbortController();this.closed=false;this.dirty=false;this.loading=true;this.finishing=false;this.feedback=null;this.hintMessage=null;this.savedSnapshot=null;this.keepLoop=false;}
  get paused(){return this.session?.paused||false;}
  get state(){return this.session?.state;}
  get level(){return this.session?.level;}
  readState(){return {dirty:this.dirty,saving:!!this.saveBusy||this.ctx.storage.saving};}
  async mount(){
    this.root.innerHTML='<div class="loading-screen"><span class="status-dot"></span> 주문 데이터를 불러오고 있어요…</div>';
    let restoring=false;
    try{
      this.catalog=await this.ctx.levels.load({signal:this.abort.signal});if(this.closed)return;
      const resume=this.route.params.get('resume')==='1';let snapshot=null;
      if(resume){restoring=true;snapshot=await this.ctx.storage.loadRun();if(!snapshot)throw Error('이어할 저장이 없어요. 시작 화면에서 새 흐름을 만들어 주세요.');}
      if(this.closed)return;
      this.session=new GameSession({catalog:this.catalog,mode:this.route.params.get('mode')==='practice'?'practice':'challenge',snapshot});
      this.savedSnapshot=snapshot?clone(snapshot):null;this.loading=false;this.dirty=!snapshot;this.feedback=this.session.lastResult||null;
      this.buildShell();this.render();
      this.root.addEventListener('click',e=>this.click(e),{signal:this.abort.signal});
      this.root.addEventListener('dragstart',e=>this.dragStart(e),{signal:this.abort.signal});
      this.root.addEventListener('dragover',e=>this.dragOver(e),{signal:this.abort.signal});
      this.root.addEventListener('dragend',()=>this.clearDrop(),{signal:this.abort.signal});
      this.root.addEventListener('drop',e=>this.drop(e),{signal:this.abort.signal});
      document.addEventListener('keydown',e=>this.key(e),{signal:this.abort.signal});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},{signal:this.abort.signal});
      addEventListener('blur',()=>this.pause(),{signal:this.abort.signal});
      this.interval=setInterval(()=>this.tick(),100);
      if(document.hidden||!document.hasFocus())this.pause();
      if(snapshot)this.ctx.toast('저장한 흐름을 불러왔어요. 계속하기를 누르면 시작합니다.');
      if(this.session.finished)this.finish();
    }catch(error){
      if(this.closed||error.name==='AbortError')return;
      this.loading=true;this.root.innerHTML='<section class="info-screen error-screen"><p class="eyebrow">FLOW ON HOLD</p><h1>'+(restoring?'저장한 흐름을<br>이어갈 수 없어요.':'주문이 아직<br>도착하지 않았어요.')+'</h1><p id="load-error"></p><div class="hero-actions"><button class="btn btn-primary" data-action="retry-load">다시 불러오기 ↻</button><a class="btn btn-secondary" href="#/" data-route="/">시작 화면으로</a></div></section>';
      this.root.querySelector('#load-error').textContent=restoring?'저장된 진행은 덮어쓰지 않고 보관했어요. '+error.message:'데이터를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';
      this.root.querySelector('[data-action="retry-load"]').onclick=()=>this.mount();
    }
  }
  buildShell(){
    this.root.innerHTML=`<section class="game-screen">
      <div class="game-top"><div class="round-meta"><p class="eyebrow" id="round-label"></p><h1 class="level-title"></h1><p class="level-subtitle"></p></div><div class="hud"><div class="hud-item"><span>SCORE</span><strong id="score">0</strong></div><div class="hud-item combo-item"><span>COMBO</span><strong id="combo">×0</strong></div><div class="hud-item timer-block"><span id="timer-label">TIME LEFT</span><strong id="timer">90<span>s</span></strong></div><button class="mini-btn pause-button" data-action="pause" aria-label="일시정지">Ⅱ</button></div></div>
      <div class="progress-track" aria-label="미션 진행"></div>
      <div class="mission-bar"><span class="label">YOUR MISSION</span><p id="mission"></p><button class="text-link" data-action="hint">힌트 <span id="hint-cost">−5초</span> ↗</button></div><p id="hint" class="hint-note" role="status" hidden></p>
      <div class="game-layout"><aside class="reference-panel"><div class="panel-heading"><h2><span class="status-dot"></span> 들어온 주문</h2><span class="label" id="input-count"></span></div><div class="input-packets" id="input-packets"></div><div class="target-panel"><div class="panel-heading"><h2>지켜야 할 결과</h2><span class="label">TARGET ↘</span></div><pre id="target-output"></pre></div><details class="source-details"><summary>원래 루프 펼쳐 보기 <span>↗</span></summary><pre><code id="source-code"></code></pre></details><p class="reference-caption">연결 방식은 바꿔도,<br>주문의 순서와 결과는 그대로.</p></aside>
      <div class="assembly-panel"><section class="rack"><div class="panel-heading"><h2><span class="section-number">01</span> 작업 고르기</h2><span class="label">OPERATOR RACK</span></div><p class="panel-help">‘+ 연결’을 누르거나, 카드를 선택하고 아래 연결 지점에 넣으세요.</p><div class="op-rack"></div></section><section class="pipeline-area"><div class="panel-heading"><h2><span class="section-number">02</span> 흐름 연결하기</h2><span class="label">LEFT → RIGHT</span></div><div class="pipeline-track"></div><div class="generated-code"><span class="label">YOUR PIPELINE / JS</span><pre><code id="pipeline-code"></code></pre></div></section><div class="board-controls"><button class="btn btn-primary" data-action="check">파이프라인 실행 <span aria-hidden="true">↗</span></button><button class="btn btn-secondary" data-action="keep-loop">원래 루프 유지</button><button class="text-link" data-action="reset">초기화 ↻</button><button class="text-link" data-action="save">진행 저장 ↓</button></div><p class="hold-note">준비된 카드로 결과를 지킬 수 없다면 ‘원래 루프 유지’를 선택하세요.</p><div class="feedback-panel" id="feedback" role="status" aria-live="polite" hidden></div></div></div>
      <div class="keyboard-strip"><span><kbd>↑</kbd><kbd>↓</kbd> 카드 선택</span><span><kbd>Enter</kbd> 연결</span><span><kbd>←</kbd><kbd>→</kbd> 순서 변경</span><span><kbd>Delete</kbd> 빼기</span><span><kbd>Space</kbd> 실행</span><span><kbd>Esc</kbd> 멈추기</span></div><p class="learn-note game-footnote">각 문제에 준비된 입력을 비교합니다. 모든 입력에 대한 증명이나 실행 속도 비교는 아니에요.</p>
      <div class="pause-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="pause-title"><div class="modal-card"><p class="eyebrow"><span class="status-dot"></span> FLOW PAUSED</p><h2 id="pause-title">흐름도 잠깐,<br>숨 고르기.</h2><p>시간과 배치는 여기 그대로.<br>준비되면 이어서 연결하세요.</p><div class="hero-actions"><button class="btn btn-primary" data-action="resume">계속하기 ↗</button><button class="btn btn-secondary" data-action="save">진행 저장 ↓</button><a class="text-link" href="#/" data-route="/">시작 화면으로 →</a></div><p class="save-status" role="status"></p></div></div><div class="celebration" aria-hidden="true"></div>
    </section>`;
  }
  render(){
    if(this.closed||this.loading)return;
    const s=this.state,l=this.level,editing=s.phase==='editing';
    this.root.querySelector('#round-label').textContent=(s.mode==='practice'?'PRACTICE / NO RUSH':'90 SECOND CHALLENGE')+' / STAGE '+String(s.index+1).padStart(2,'0')+' OF 08';
    this.root.querySelector('.level-title').textContent=l.title;this.root.querySelector('.level-subtitle').textContent=l.subtitle;this.root.querySelector('#mission').textContent=l.mission;
    this.root.querySelector('#hint-cost').textContent=s.mode==='practice'?'무료':'−5초';
    const hint=this.root.querySelector('#hint');hint.hidden=!this.hintMessage;hint.textContent=this.hintMessage||'';
    this.root.querySelector('.progress-track').replaceChildren(...this.catalog.levels.map((level,i)=>{const n=node('span','progress-step',String(i+1).padStart(2,'0'));n.dataset.state=i<s.solved?'done':i===s.index?'current':'next';n.setAttribute('aria-label',String(i+1)+'번 '+(i<s.solved?'완료':i===s.index?'진행 중':'대기'));return n;}));
    this.root.querySelector('#input-count').textContent=l.input.length+' ORDERS';
    const inputs=this.root.querySelector('#input-packets');inputs.replaceChildren(...l.input.map((row,i)=>this.packet(row,i)));
    if(!l.input.length)inputs.append(node('p','panel-help','지금은 주문이 없어요.'));
    this.root.querySelector('#target-output').textContent=json(runReference(l).output);
    this.root.querySelector('#source-code').textContent=l.sourceCode;
    this.root.querySelector('.op-rack').replaceChildren(...l.ops.map(op=>this.opCard(op)));
    const track=this.root.querySelector('.pipeline-track');track.replaceChildren();
    track.append(node('span','flow-terminal','IN'));
    for(let i=0;i<=s.plan.length;i++){
      const insert=node('button','insert-point',s.plan.length?'＋':'＋ 여기에 연결');insert.type='button';insert.dataset.action='insert';insert.dataset.index=i;insert.disabled=!editing;insert.setAttribute('aria-label',(i+1)+'번째에 선택한 카드 넣기');track.append(insert);
      if(i<s.plan.length)track.append(this.slot(s.plan[i],i));
    }
    track.append(node('span','flow-terminal output-terminal','OUT'));
    this.root.querySelector('#pipeline-code').textContent=pipelineCode(l,s.plan);
    for(const action of ['check','keep-loop','reset','hint'])this.root.querySelector('[data-action="'+action+'"]').disabled=!editing;
    this.renderFeedback();this.updateHud();this.renderPause();
  }
  packet(row,i){
    const packet=node('article','input-packet');packet.append(node('span','packet-no',row.id||'#'+(i+1)),node('strong','',row.menu||'주문 '+(i+1)));
    const meta=node('div','packet-meta');for(const [key,label]of [['customer',''],['quantity','개'],['price','원'],['amount','원']])if(row[key]!==undefined)meta.append(node('span','',typeof row[key]==='number'?row[key].toLocaleString()+label:row[key]));packet.append(meta);
    const tags=node('div','packet-tags');if(row.paid!==undefined)tags.append(node('span',row.paid?'tag-paid':'tag-unpaid',row.paid?'결제 완료':'미결제'));if(row.cancelled)tags.append(node('span','tag-unpaid','취소'));packet.append(tags);return packet;
  }
  opCard(op){
    const used=this.state.plan.includes(op.id),selected=this.state.selected===op.id,card=node('article','op-card');card.dataset.id=op.id;card.dataset.kind=op.kind;card.dataset.selected=String(selected);card.dataset.used=String(used);card.tabIndex=0;card.draggable=this.state.phase==='editing';card.setAttribute('aria-label',op.label+(used?' · 연결됨':' · 선택 후 연결'));card.setAttribute('aria-keyshortcuts','Enter');
    card.append(node('span','op-kind '+op.kind,(kindLabel[op.kind]||op.kind).toUpperCase()),node('h3','',op.label),node('p','op-description',op.description),node('code','',op.code));
    const button=node('button','op-add',used?'✓ 연결됨':'+ 연결');button.type='button';button.dataset.action='place';button.dataset.id=op.id;button.disabled=used||this.state.phase!=='editing';button.setAttribute('aria-label',op.label+' 맨 뒤 연결');card.append(button);return card;
  }
  slot(id,index){
    const op=this.level.ops.find(o=>o.id===id),slot=node('article','pipeline-slot');slot.dataset.id=id;slot.dataset.index=index;slot.dataset.kind=op.kind;slot.dataset.selected=String(this.state.selected===id);slot.tabIndex=0;slot.draggable=this.state.phase==='editing';slot.setAttribute('aria-label',(index+1)+'번째 '+op.label);
    slot.append(node('span','slot-position',String(index+1).padStart(2,'0')),node('span','op-kind '+op.kind,kindLabel[op.kind]||op.kind),node('h3','',op.label));
    const tools=node('div','slot-tools');
    const button=(text,action,label,disabled=false)=>{const b=node('button','mini-btn',text);b.type='button';b.dataset.action=action;b.dataset.index=index;b.disabled=disabled||this.state.phase!=='editing';b.setAttribute('aria-label',op.label+' '+label);return b;};
    tools.append(button('←','move-left','앞으로 이동',index===0),button('→','move-right','뒤로 이동',index===this.state.plan.length-1),button('×','remove','빼기'));slot.append(tools);
    const insertion=node('div','slot-insertion');insertion.append(button('앞에 +','insert-before','앞에 선택한 카드 넣기'),button('뒤에 +','insert-after','뒤에 선택한 카드 넣기'));slot.append(insertion);return slot;
  }
  click(event){
    const b=event.target.closest('[data-action]');
    if(b){const action=b.dataset.action;
      if(action==='pause'){this.pause();return;}
      if(action==='resume'){if(this.saveBusy)return;this.session.resume();this.dirty=true;this.renderPause();return;}
      if(action==='save'){this.saveFromButton(b);return;}
      if(this.paused||this.finishing)return;
      if(action==='next'){this.next();return;}
      if(this.state.phase!=='editing')return;
      if(action==='hint'){
        const hint=this.session.hint();this.hintMessage=typeof hint==='string'?hint:hint?.message||'미션과 원래 루프에서 순서를 확인해 보세요.';this.ctx.sound.play('hint');this.dirty=true;this.render();if(this.session.finished)this.finish();return;
      }
      if(action==='check'||action==='keep-loop'){this.verify(action==='keep-loop');return;}
      if(action==='reset'){this.session.reset();this.changed();return;}
      if(action==='place'){this.insertOp(b.dataset.id);this.ctx.sound.play('move');this.changed();return;}
      if(action==='insert'||action==='insert-before'||action==='insert-after'){
        if(!this.state.selected){this.ctx.toast('먼저 작업 카드를 선택해 주세요.');return;}
        this.insertOp(this.state.selected,Number(b.dataset.index)+(action==='insert-after'?1:0));this.ctx.sound.play('move');this.changed();return;
      }
      if(action==='remove'){this.session.remove(Number(b.dataset.index));this.changed();return;}
      if(action==='move-left'||action==='move-right'){const i=Number(b.dataset.index);this.session.move(i,i+(action==='move-left'?-1:1));this.changed();return;}
      return;
    }
    const card=event.target.closest('.op-card,.pipeline-slot');if(card&&!this.paused&&this.state.phase==='editing'){this.session.select(card.dataset.id);this.dirty=true;this.root.querySelectorAll('.op-card,.pipeline-slot').forEach(c=>c.dataset.selected=String(c.dataset.id===this.state.selected));this.ctx.sound.play('select');}
  }
  changed(){
    this.dirty=true;this.feedback=null;const focused=document.activeElement,focusId=focused?.closest('[data-id]')?.dataset.id,action=focused?.dataset.action,index=focused?.dataset.index;this.render();
    const selector=focusId?'[data-id="'+focusId+'"]'+(action?' [data-action="'+action+'"]':''):action?'[data-action="'+action+'"]'+(index!==undefined?'[data-index="'+index+'"]':''):null;
    if(selector)this.root.querySelector(selector)?.focus({preventScroll:true});if(this.session.finished)this.finish();
  }
  insertOp(id,index=this.state.plan.length){
    const plan=this.state.plan,from=plan.indexOf(id);
    if(from<0)return this.session.place(id,index);
    const to=Math.min(plan.length-1,Math.max(0,index>from?index-1:index));
    return this.session.move(from,to);
  }
  verify(keepLoop=false){
    const result=this.session.check({keepLoop});if(!result)return;
    this.feedback=result;this.keepLoop=keepLoop;this.dirty=true;this.ctx.sound.play(result.correct?'pass':'fail');this.render();
    if(result.correct)this.celebrate();
    this.root.querySelector('#feedback').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
    if(this.session.finished)this.finish();
  }
  renderFeedback(){
    const area=this.root.querySelector('#feedback');
    let f=this.feedback;
    if(!f&&this.state.phase==='cleared')f={correct:true,message:'저장한 정답이에요. 다음 흐름으로 이어가세요.'};
    area.hidden=!f;if(!f)return;area.dataset.status=f.correct?'pass':'fail';
    area.replaceChildren(node('p','eyebrow',f.correct?'FLOW VERIFIED / + COMBO':'FLOW INTERRUPTED / TRY AGAIN'),node('h2','feedback-heading',f.correct?(this.keepLoop||this.state.keepLoop?'좋은 판단! 이 루프는 지켜요.':'결과까지, 완벽한 연결.'): '어디서 달라졌을까요?'),node('p','',f.message||''));
    if(f.correct){area.append(node('p','lesson-copy',this.level.lesson));const next=node('button','btn btn-primary',this.state.index===7?'최종 결과 보기 ↗':'다음 미션으로 →');next.dataset.action='next';area.append(next);}
    if(f.expected!==undefined||f.actual!==undefined){const grid=node('div','output-grid');for(const [label,value]of [['원래 루프',f.expected],['지금 연결',f.actual]]){const cell=node('div','output-cell');cell.append(node('span','label',label),node('pre','',json(value)));grid.append(cell);}area.append(grid);}
    if(f.counterexample){const detail=node('details','counterexample');detail.open=true;detail.append(node('summary','','결과가 달라지는 주문 보기'));const example=f.counterexample;if(example.input!==undefined){detail.append(node('span','label','이 주문을 넣으면'),node('pre','',json(example.input)));if(example.expected!==undefined)detail.append(node('span','label','원래 루프의 결과'),node('pre','',json(example.expected)));if(example.actual!==undefined)detail.append(node('span','label','지금 연결의 결과'),node('pre','',json(example.actual)));}else detail.append(node('pre','',json(example)));area.append(detail);}
    if(!f.correct)area.append(node('p','learn-note',this.state.mode==='challenge'?'5초가 사용됐어요. 카드는 그대로예요. 순서를 바꿔 다시 연결해 보세요.':'연습은 감점 없이, 충분히 실험해 보세요.'));
  }
  next(){
    if(this.state.phase!=='cleared'||this.paused||this.finishing)return;
    this.session.advance();this.dirty=true;this.feedback=null;this.hintMessage=null;this.keepLoop=false;
    if(this.session.finished){this.finish();return;}
    this.render();this.root.querySelector('.level-title').scrollIntoView({block:'start',behavior:'instant'});this.root.focus({preventScroll:true});
  }
  updateHud(){
    if(this.loading||this.closed)return;
    this.root.querySelector('#score').textContent=this.state.score.toLocaleString();this.root.querySelector('#combo').textContent='×'+this.state.combo;
    this.root.querySelector('#timer').textContent=this.state.mode==='practice'?'∞':String(Math.ceil(this.state.remainingMs/1000)).padStart(2,'0');
    this.root.querySelector('#timer-label').textContent=this.state.mode==='practice'?'NO RUSH':'TIME LEFT';
    const timer=this.root.querySelector('.timer-block');timer.dataset.warning=String(this.state.mode==='challenge'&&this.state.remainingMs<=15000);timer.style.setProperty('--time',this.state.remainingMs/90000);
  }
  tick(){
    if(this.closed||this.loading||this.finishing)return;const wasPaused=this.paused;this.session.tick();
    if(!wasPaused&&!this.session.finished)this.dirty=true;
    this.updateHud();if(this.session.finished)this.finish();
  }
  pause(){
    if(this.closed||this.loading||this.finishing||this.paused)return;this.session.pause();this.updateHud();this.renderPause();if(this.session.finished)this.finish();
  }
  renderPause(){
    if(this.loading||this.closed)return;
    const overlay=this.root.querySelector('.pause-overlay'),wasHidden=overlay.hidden;overlay.hidden=!this.paused;
    overlay.querySelector('[data-action="resume"]').disabled=!!this.saveBusy;
    for(const child of this.root.querySelector('.game-screen').children)if(child!==overlay)child.inert=this.paused;
    if(this.paused&&wasHidden)this.focusPause();
  }
  focusPause(){this.root.querySelector('.pause-overlay [data-action="resume"]')?.focus({preventScroll:true});}
  async saveFromButton(button){
    if(this.saveBusy)return;
    button.disabled=true;
    try{await this.save();this.ctx.toast('배치와 남은 시간을 저장했어요.');const status=this.root.querySelector('.save-status');if(status)status.textContent='저장 완료 · 시작 화면에서 이어할 수 있어요.';}
    catch{this.ctx.toast('저장하지 못했어요. 현재 진행은 그대로예요. 다시 시도해 주세요.');}
    finally{if(!this.closed)button.disabled=false;}
  }
  async save(){
    if(!this.session||this.loading)throw Error('저장할 흐름이 없어요.');
    if(this.savePromise)return this.savePromise;
    this.pause();this.saveBusy=true;this.renderPause();const snapshot=this.session.snapshot();
    this.savePromise=(async()=>{try{await this.ctx.storage.saveRun(snapshot);this.savedSnapshot=clone(snapshot);this.dirty=JSON.stringify(this.session.snapshot())!==JSON.stringify(snapshot);}
      finally{this.saveBusy=false;this.savePromise=null;if(!this.closed)this.renderPause();}})();
    return this.savePromise;
  }
  async discard(){await this.ctx.storage.clearRunIfMatches(this.savedSnapshot);this.dirty=false;}
  async finish(){
    if(this.finishing||this.closed)return;this.finishing=true;clearInterval(this.interval);
    const result=this.session.toResult();this.ctx.lastResult=result;this.ctx.resultSaveError=false;
    const envelope={result,saved:false,savedRun:this.savedSnapshot};try{sessionStorage.setItem(RESULT_KEY,JSON.stringify(envelope));}catch{}
    try{await this.ctx.storage.saveResult(result);await this.ctx.storage.clearRunIfMatches(this.savedSnapshot);envelope.saved=true;}catch{this.ctx.resultSaveError=true;}
    try{sessionStorage.setItem(RESULT_KEY,JSON.stringify(envelope));}catch{}
    if(this.closed)return;this.dirty=false;await this.ctx.router.navigate('/result');
  }
  key(event){
    if(this.closed||this.loading||document.querySelector('#guard-dialog[open]'))return;
    const target=event.target?.closest?event.target:document.body;if(target.closest('input,textarea,select,[contenteditable=true]'))return;
    if(event.key==='Escape'){event.preventDefault();this.pause();return;}
    if(this.paused){if(event.key==='Tab'){const buttons=[...this.root.querySelectorAll('.pause-overlay button:not(:disabled),.pause-overlay a')],i=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}return;}
    if(this.finishing||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    if((event.key===' '||event.key==='Enter')&&target.closest('button,a,summary'))return;
    if(this.state.phase==='cleared'){if(event.key===' '||event.key==='Enter'){event.preventDefault();this.next();}return;}
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();const ids=this.level.ops.map(o=>o.id),i=ids.indexOf(this.state.selected);this.session.select(ids[(i+(event.key==='ArrowDown'?1:-1)+ids.length)%ids.length]);this.dirty=true;this.render();this.root.querySelector('.op-card[data-id="'+this.state.selected+'"]')?.focus({preventScroll:true});return;
    }
    if(event.key==='Enter'){
      event.preventDefault();const id=target.closest('[data-id]')?.dataset.id||this.state.selected;if(id){this.session.select(id);this.insertOp(id);this.changed();}return;
    }
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      const i=this.state.plan.indexOf(this.state.selected);if(i>=0){event.preventDefault();const to=i+(event.key==='ArrowLeft'?-1:1);if(to>=0&&to<this.state.plan.length){this.session.move(i,to);this.changed();}}return;
    }
    if(event.key==='Delete'||event.key==='Backspace'){
      const i=this.state.plan.indexOf(this.state.selected);if(i>=0){event.preventDefault();this.session.remove(i);this.changed();}return;
    }
    if(event.key===' '){event.preventDefault();this.verify();}
  }
  dragStart(event){
    const card=event.target.closest('.op-card,.pipeline-slot');if(!card||this.paused||this.state.phase!=='editing'){event.preventDefault();return;}
    this.session.select(card.dataset.id);event.dataTransfer.setData('text/plain',card.dataset.id);event.dataTransfer.effectAllowed='move';
  }
  dragOver(event){
    const target=event.target.closest('.insert-point,.pipeline-slot,.pipeline-track');if(!target||this.paused||this.state.phase!=='editing')return;event.preventDefault();this.clearDrop();target.dataset.over='true';event.dataTransfer.dropEffect='move';
  }
  clearDrop(){this.root.querySelectorAll('[data-over]').forEach(el=>delete el.dataset.over);}
  drop(event){
    const target=event.target.closest('.insert-point,.pipeline-slot,.pipeline-track');if(!target||this.paused||this.state.phase!=='editing')return;event.preventDefault();const id=event.dataTransfer.getData('text/plain');this.clearDrop();
    if(!this.level.ops.some(op=>op.id===id))return;
    this.insertOp(id,target.dataset.index!==undefined?Number(target.dataset.index):this.state.plan.length);this.ctx.sound.play('move');this.changed();
  }
  celebrate(){
    const area=this.root.querySelector('.celebration');area.replaceChildren(...Array.from({length:16},(_,i)=>{const spark=node('i');spark.style.setProperty('--i',i);spark.style.setProperty('--x',((i*37)%101)+'%');return spark;}));clearTimeout(this.celebrationTimer);this.celebrationTimer=setTimeout(()=>area.replaceChildren(),1100);
  }
  dispose(){this.closed=true;this.abort.abort();clearInterval(this.interval);clearTimeout(this.celebrationTimer);}
}
