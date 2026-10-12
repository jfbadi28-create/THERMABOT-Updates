const test=require('node:test'),assert=require('node:assert/strict'),C=require('../suite-core.js');
const data={projects:[
  {id:'urgent',name:'Urgente',status:'Urgente',nextAction:'Revisar montaje'},
  {id:'wait',name:'Espera',status:'Esperando tercero',nextAction:'Reclamar respuesta',nextDueDate:'2026-10-16'},
  {id:'missing',name:'Falta definir',status:'Activo',nextAction:' - '},
  {id:'closed',name:'Terminada',status:'Finalizado',nextAction:'Antecedente'},
  {id:'undated',name:'Sin fecha',status:'Activo',nextAction:'Preparar pliego',nextDueDate:'',targetDate:'2026-01-01'}
],milestones:[{id:'done',projectId:'urgent',title:'Resuelta',status:'Cumplido',dueDate:'2026-10-01'},{id:'late',projectId:'urgent',title:'Vencida',status:'Pendiente',dueDate:'2026-10-09'}],equipment:[],documents:[]};
test('La cola diaria muestra urgencias sin fecha, esperas y faltantes sin inventar tareas',()=>{
  const q=C.dailyQueue(data,'2026-10-12');
  assert.deepEqual(q.missingAction.map(p=>p.id),['missing']);
  assert(q.today.some(t=>t.id==='next:urgent'));
  assert.deepEqual(q.overdue.map(t=>t.id),['late']);
  assert.deepEqual(q.waiting.map(t=>t.id),['next:wait']);
  assert(q.undated.some(t=>t.id==='next:undated'));
  assert(!q.all.some(t=>['done','next:missing','next:closed'].includes(t.id)));
  assert.equal(C.tasks(data,'2026-10-12').find(t=>t.id==='next:undated').dueDate,'');
});
test('El estado de la próxima acción respeta el flujo guardado',()=>{
  const q=C.dailyQueue(data,'2026-10-12',{urgent:{nextTaskStatus:'Cumplido'},undated:{nextTaskStatus:'Esperando respuesta'}});
  assert(!q.all.some(t=>t.id==='next:urgent'));assert(q.waiting.some(t=>t.id==='next:undated'));
  assert(!C.search(data,[],'-').some(r=>r.id==='next:missing'));
});
