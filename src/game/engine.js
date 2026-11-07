// Only these operations run. Displayed JavaScript is never interpreted.
const ACTIONS = Object.freeze({
  paid:{kind:'filter',fields:{paid:'boolean'}},
  active:{kind:'filter',fields:{cancelled:'boolean'}},
  menu:{kind:'map',fields:{menu:'string'}},
  customer:{kind:'map',fields:{customer:'string'}},
  amount:{kind:'map',fields:{price:'number',quantity:'number'}},
  price:{kind:'map',fields:{price:'number'}},
  quantity:{kind:'map',fields:{quantity:'number'}},
  sum:{kind:'reduce'},
  discount:{kind:'map',fields:{amount:'number'}},
  threshold:{kind:'filter',fields:{amount:'number'}},
  extract:{kind:'map',fields:{amount:'number'}},
  'stock-check':{kind:'filter',fields:{quantity:'number'}},
  ids:{kind:'map',fields:{id:'string'}}
});
const REFERENCES = Object.freeze({
  paid:{paid:'boolean'},menu:{menu:'string'},'paid-customer':{paid:'boolean',customer:'string'},
  amount:{price:'number',quantity:'number'},total:{price:'number',quantity:'number'},
  'active-total':{cancelled:'boolean',price:'number',quantity:'number'},
  'discount-threshold':{amount:'number'},stock:{id:'string',quantity:'number'}
});
const clone = value => structuredClone(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const identity = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
function requireValue(condition,message) {if(!condition)throw new TypeError(message);}
function text(value,name,max=6000) {requireValue(typeof value==='string' && value.length>0 && value.length<=max,`${name}: 문자열 형식이 올바르지 않습니다.`);}

function fields(rows,required) {
  requireValue(Array.isArray(rows),'이 단계에는 배열이 필요합니다.');
  for(const row of rows) {
    requireValue(plain(row),'주문 객체가 필요합니다. 이전 단계가 자료 모양을 바꿨습니다.');
    for(const [key,type] of Object.entries(required)) {
      requireValue(typeof row[key]===type && (type!=='number'||finite(row[key])),`주문에 ${key} (${type}) 값이 필요합니다.`);
    }
  }
}
function validateInput(input,required) {
  requireValue(Array.isArray(input) && input.length<=200,'입력은 최대 200개 주문 배열이어야 합니다.');
  for(const row of input) {
    requireValue(plain(row) && Object.keys(row).length<=16,'입력 주문 객체가 올바르지 않습니다.');
    for(const [key,value] of Object.entries(row)) {
      requireValue(!['__proto__','constructor','prototype'].includes(key) && key.length<=40,'입력 필드가 올바르지 않습니다.');
      requireValue(typeof value==='boolean'||(typeof value==='string'&&value.length<=200)||(finite(value)&&value>=0&&value<=1000000),'입력 값은 작은 문자열·불리언·유한한 양수여야 합니다.');
      if(key==='quantity')requireValue(Number.isInteger(value)&&value<=10000,'수량은 0~10000의 정수여야 합니다.');
    }
  }
  fields(input,required);
}
function planOps(level,plan) {
  requireValue(Array.isArray(plan) && plan.length<=level.ops.length,'파이프라인 배열이 올바르지 않습니다.');
  requireValue(new Set(plan).size===plan.length,'같은 카드를 두 번 사용할 수 없습니다.');
  return plan.map(id=>{
    const op=level.ops.find(candidate=>candidate.id===id);
    requireValue(op && Object.hasOwn(ACTIONS,op.action),'알 수 없는 연산 카드입니다.');
    return op;
  });
}

export function validateLevel(level) {
  requireValue(plain(level),'라운드 데이터가 올바르지 않습니다.');
  requireValue(identity(level.id),'라운드 ID가 올바르지 않습니다.');
  for(const key of ['title','subtitle','mission','lesson','sourceCode'])text(level[key],key);
  requireValue(Object.hasOwn(REFERENCES,level.reference),'등록되지 않은 원본 동작입니다.');
  requireValue(typeof level.keepLoop==='boolean','반복문 유지 설정이 필요합니다.');
  requireValue(level.keepLoop===(level.reference==='stock'),'재고 라운드의 반복문 유지 설정이 올바르지 않습니다.');
  if(level.reference==='stock')requireValue(Number.isInteger(level.stock)&&level.stock>=0&&level.stock<=10000,'최초 재고가 올바르지 않습니다.');
  if(level.reference==='discount-threshold') {
    requireValue(finite(level.discountRate)&&level.discountRate>0&&level.discountRate<=1,'할인율이 올바르지 않습니다.');
    requireValue(finite(level.threshold)&&level.threshold>=0&&level.threshold<=1000000,'기준 금액이 올바르지 않습니다.');
  }
  requireValue(Array.isArray(level.ops)&&level.ops.length>0&&level.ops.length<=12,'연산 카드 목록이 올바르지 않습니다.');
  const ids=new Set();
  for(const op of level.ops) {
    requireValue(plain(op)&&identity(op.id)&&!ids.has(op.id),'연산 카드 ID가 없거나 중복되었습니다.');ids.add(op.id);
    requireValue(Object.hasOwn(ACTIONS,op.action)&&op.kind===ACTIONS[op.action].kind,'등록된 순수 연산과 종류만 사용할 수 있습니다.');
    for(const key of ['label','description','code'])text(op[key],key);
  }
  planOps(level,level.solution);
  validateInput(level.input,REFERENCES[level.reference]);
  requireValue(Array.isArray(level.cases)&&level.cases.length>=2&&level.cases.length<=24,'라운드에는 최소 두 검증 예제가 필요합니다.');
  for(const input of level.cases)validateInput(input,REFERENCES[level.reference]);
  requireValue(level.cases.some(input=>input.length===0),'빈 입력 검증 예제가 필요합니다.');
  // This checks finite declared samples, not arbitrary program equivalence.
  const assessment=assessPlan(level,level.solution,{keepLoop:level.keepLoop});
  requireValue(assessment.correct,'제공된 해답이 원본 동작을 보존하지 않습니다.');
  return level;
}

export function validateCatalog(body) {
  requireValue(plain(body)&&body.schema===1&&body.id==='pipe-rush-v1','지원하지 않는 라운드 묶음입니다.');
  requireValue(Array.isArray(body.levels)&&body.levels.length===8,'여덟 라운드가 필요합니다.');
  const ids=new Set();
  for(const level of body.levels){validateLevel(level);requireValue(!ids.has(level.id),'라운드 ID가 중복되었습니다.');ids.add(level.id);}
  return body;
}

export function runReference(level,input=level.input) {
  requireValue(Object.hasOwn(REFERENCES,level.reference),'알 수 없는 원본 동작입니다.');
  validateInput(input,REFERENCES[level.reference]);
  const rows=clone(input),trace=[{label:'입력',output:clone(rows)}];
  let output=['total','active-total'].includes(level.reference)?0:[];
  let remaining=level.stock;
  for(const order of rows) {
    switch(level.reference) {
      case 'paid': if(order.paid)output.push(order);break;
      case 'menu': output.push(order.menu);break;
      case 'paid-customer': if(order.paid)output.push(order.customer);break;
      case 'amount': output.push(order.price*order.quantity);break;
      case 'total': output+=order.price*order.quantity;break;
      case 'active-total': if(!order.cancelled)output+=order.price*order.quantity;break;
      case 'discount-threshold': {
        const discounted={...order,amount:order.amount*level.discountRate};
        if(discounted.amount>=level.threshold)output.push(discounted);break;
      }
      case 'stock': {
        const accepted=order.quantity<=remaining;
        if(accepted){output.push(order.id);remaining-=order.quantity;}
        trace.push({label:`주문 ${order.id}`,accepted,remaining,output:clone(output)});break;
      }
    }
  }
  if(level.reference==='stock')output={accepted:output,remaining};
  trace.push({label:'원본 결과',output:clone(output)});
  return {output,trace};
}

function execute(level,op,value) {
  const definition=ACTIONS[op.action];
  requireValue(Array.isArray(value),'이미 합계 하나가 되었습니다. 다음 배열 연산을 적용할 수 없습니다.');
  if(definition.fields)fields(value,definition.fields);
  switch(op.action) {
    case 'paid':return value.filter(order=>order.paid);
    case 'active':return value.filter(order=>!order.cancelled);
    case 'menu':return value.map(order=>order.menu);
    case 'customer':return value.map(order=>order.customer);
    case 'amount':return value.map(order=>order.price*order.quantity);
    case 'price':return value.map(order=>order.price);
    case 'quantity':return value.map(order=>order.quantity);
    case 'sum':requireValue(value.every(finite),'합계 카드는 숫자 배열만 받습니다. 먼저 금액으로 바꾸세요.');return value.reduce((total,amount)=>total+amount,0);
    case 'discount':return value.map(order=>({...order,amount:order.amount*level.discountRate}));
    case 'threshold':return value.filter(order=>order.amount>=level.threshold);
    case 'extract':return value.map(order=>order.amount);
    case 'stock-check':return value.filter(order=>order.quantity<=level.stock);
    case 'ids':return value.map(order=>order.id);
  }
}

export function runPipeline(level,plan,input=level.input) {
  const trace=[];
  let output;
  try {
    requireValue(Array.isArray(input)&&input.length<=200,'입력 배열이 올바르지 않습니다.');
    output=clone(input);trace.push({label:'입력',output:clone(output)});
    const ops=planOps(level,plan);
    for(const op of ops) {
      output=execute(level,op,output);
      trace.push({operatorId:op.id,label:op.label,output:clone(output)});
    }
    return {output,trace};
  } catch(error) {
    const message=error instanceof Error?error.message:'연산을 실행할 수 없습니다.';
    trace.push({label:'연산 중단',error:message,output:clone(output)});
    return {output,trace,error:message};
  }
}

function same(left,right) {
  if(left===right)return true;
  if(Array.isArray(left)||Array.isArray(right))return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>same(value,right[index]));
  if(plain(left)&&plain(right)){const keys=Object.keys(left);return keys.length===Object.keys(right).length&&keys.every(key=>Object.hasOwn(right,key)&&same(left[key],right[key]));}
  return false;
}

export function pipelineCode(level,plan) {
  const ops=planOps(level,plan);
  return `const result = orders${ops.length?'\n  '+ops.map(op=>op.code).join('\n  '):''};`;
}

export function assessPlan(level,plan,{keepLoop=false}={}) {
  let code='';
  try {
    requireValue(typeof keepLoop==='boolean','반복문 유지 선택은 참 또는 거짓이어야 합니다.');
    planOps(level,plan);
    code=keepLoop?level.sourceCode:pipelineCode(level,plan);
  } catch(error){return {correct:false,message:error.message,expected:runReference(level).output,actual:undefined,trace:[],code};}
  const reference=runReference(level);
  if(keepLoop) {
    return {correct:level.keepLoop,message:level.keepLoop?'재고의 순차적 변화를 보존했습니다. 제공된 카드 대신 반복문을 유지합니다.':'이 라운드에서는 제공된 카드로 원래 동작을 보존해 보세요.',expected:reference.output,actual:reference.output,trace:reference.trace,code};
  }
  const samples=[level.input,...level.cases];
  let preview;
  for(const input of samples) {
    const expected=runReference(level,input).output;
    const result=runPipeline(level,plan,input);
    if(!preview)preview=result;
    if(result.error||!same(expected,result.output)) {
      const counterexample={input:clone(input),expected,actual:result.output,...(result.error?{error:result.error}:{})};
      return {correct:false,message:result.error||'순서·중복·금액이 원본과 다릅니다. 반례를 확인하세요.',expected,actual:result.output,trace:result.trace,counterexample,code};
    }
  }
  // The stock task requires retaining state, not comparing a convenient sample.
  if(level.keepLoop)return {correct:false,message:'제공된 카드에는 주문 사이의 재고 차감을 전달할 단계가 없습니다.',expected:reference.output,actual:preview.output,trace:preview.trace,code};
  return {correct:true,message:'모든 준비된 예제에서 원본 결과·순서·중복을 보존했습니다.',expected:reference.output,actual:preview.output,trace:preview.trace,code};
}

export function hintFor(level,plan) {
  if(level.keepLoop)return {message:'앞 주문이 재고를 차감하면 다음 주문의 조건도 달라집니다. 이번에는 반복문을 유지하세요.'};
  const prefix=Array.isArray(plan)?plan:[];
  const next=level.solution.find((id,index)=>prefix[index]!==id);
  if(!next)return {message:'준비된 예제의 빈 입력·중복·경계 금액까지 실행해 확인하세요.'};
  const op=level.ops.find(candidate=>candidate.id===next);
  return {message:`${op.label}: ${op.description}. 단계의 순서도 확인하세요.`,operatorId:op.id};
}
