(function(root){
'use strict';
const sections=['projects','equipment','milestones','documents'];
function validateBalance(p){
 if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id||typeof p.nombre!=='string'||!p.condiciones||!Array.isArray(p.ambientes)||!p.ambientes.length) throw Error('El archivo no contiene un balance completo.');
 return p;
}
function agenda(tracker,today){
 const projects=new Map((tracker.projects||[]).map(p=>[p.id,p]));
 const active=p=>p&&!['Finalizado','Suspendido'].includes(p.status);
 const items=(tracker.milestones||[]).filter(m=>m.status!=='Cumplido'&&active(projects.get(m.projectId))).map(m=>({...m,project:projects.get(m.projectId).name,overdue:!!m.dueDate&&m.dueDate<today}));
 for(const p of projects.values())if(active(p)&&p.nextAction)items.push({id:'next:'+p.id,projectId:p.id,title:p.nextAction,project:p.name,dueDate:p.targetDate||'',status:p.status,owner:p.owner,overdue:!!p.targetDate&&p.targetDate<today});
 return items.sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
}
function audit(p){
 validateBalance(p);if(p.method==='quadri-v3')return {balanceId:p.id,balanceName:p.nombre,generatedAt:new Date().toISOString(),ruleVersion:'quadri-review-v1',scope:'Datos y trazabilidad del balance Quadri',findings:[{severity:'IMPORTANTE',subject:'Revisión de ingeniería',problem:'El informe conserva entradas y trazas Quadri; se requiere revisión de cargas y datos de biblioteca.',risk:'Entradas propuestas o no revisadas pueden modificar el dimensionamiento.',action:'Abrir el balance y revisar los cuatro bloques de carga por ambiente antes de emitir.'}],pending:['Cotejo con un caso real independiente','Condiciones climáticas del proyecto','Capacidad de fabricante a condiciones reales']};const findings=[];
 const add=(severity,subject,problem,risk,action)=>findings.push({severity,subject,problem,risk,action});
 const finite=x=>x!==''&&x!==null&&x!==undefined&&Number.isFinite(Number(x));
 const c=p.condiciones;
 for(const key of ['tempExterior','tempInterior','humedadExterior','humedadInterior','horaDiseno'])if(!finite(c[key]))add('CRÍTICO','Condiciones',key+' sin valor válido','El motor puede adoptar valores por defecto.','Completar y documentar la condición de diseño.');
 for(const key of ['humedadExterior','humedadInterior'])if(finite(c[key])&&(Number(c[key])<0||Number(c[key])>100))add('CRÍTICO','Condiciones',key+' fuera de 0–100%.','Condición psicrométrica inválida.','Corregir humedad.');
 if(finite(c.horaDiseno)&&(!Number.isInteger(Number(c.horaDiseno))||Number(c.horaDiseno)<0||Number(c.horaDiseno)>23))add('CRÍTICO','Condiciones','Hora de diseño inválida.','Radiación calculada para una hora inválida.','Ingresar una hora entera entre 0 y 23.');
 if(Number(c.tempExterior)<=Number(c.tempInterior))add('IMPORTANTE','Condiciones','Exterior no supera temperatura interior.','El balance está orientado a refrigeración.','Confirmar el modo de cálculo y la base térmica.');
 for(const a of p.ambientes){
  const subject=a.nombre||a.id||'Ambiente';
  for(const k of ['largo','ancho','altura','deltaTImpulsion'])if(!finite(a[k])||Number(a[k])<=0)add('CRÍTICO',subject,k+' debe ser positivo.','Geometría o caudal de impulsión inválido.','Verificar medición y unidades.');
  for(const k of ['personas','iluminacionW','equiposW','equiposLatenteW','aireExteriorPorPersona','aireExteriorACH','factorSeguridad'])if(!finite(a[k])||Number(a[k])<0)add('CRÍTICO',subject,k+' sin valor no negativo.','Carga o caudal inválido.','Completar un valor mayor o igual a cero.');
  if(!['persona','ach'].includes(a.aireExteriorModo))add('CRÍTICO',subject,'Modo de aire exterior inválido.','No se conoce el criterio de ventilación.','Elegir por persona o ACH.');
  const walls={};
  for(const m of a.muros||[]){
   if(!finite(m.largo)||Number(m.largo)<=0)add('CRÍTICO',subject,'Longitud de muro inválida.','Transmisión incorrecta.','Revisar longitud del muro.');
   walls[m.orientacion]=(walls[m.orientacion]||0)+Number(m.largo)*Number(a.altura);
  }
  const glass={};
  for(const v of a.ventanas||[]){
   for(const k of ['ancho','alto','cantidad'])if(!finite(v[k])||Number(v[k])<=0)add('CRÍTICO',subject,'Abertura con '+k+' inválido.','Superficie de vidrio incorrecta.','Revisar dimensiones y cantidad.');
   if(!finite(v.factorSombra)||Number(v.factorSombra)<0||Number(v.factorSombra)>1)add('CRÍTICO',subject,'Factor de sombra fuera de 0–1.','Ganancia solar inválida.','Corregir el factor de sombra.');
   glass[v.orientacion]=(glass[v.orientacion]||0)+Number(v.ancho)*Number(v.alto)*Number(v.cantidad);
  }
  for(const [o,area]of Object.entries(glass))if(!walls[o]||area>walls[o])add('CRÍTICO',subject,'Vidrio '+o+' sin muro suficiente.','La superficie opaca neta no es coherente.','Asociar y verificar muros y aberturas.');
  const orientations=(a.muros||[]).map(m=>m.orientacion);
  if(new Set(orientations).size<orientations.length)add('IMPORTANTE',subject,'Hay muros repetidos por orientación.','El motor descuenta el vidrio por orientación en cada muro.','Revisar la asignación antes de aceptar el balance.');
  if((a.aireExteriorModo==='persona'&&Number(a.personas)*Number(a.aireExteriorPorPersona)===0)||(a.aireExteriorModo==='ach'&&Number(a.aireExteriorACH)===0))add('IMPORTANTE',subject,'Aire exterior calculado igual a cero.','Puede faltar la carga de ventilación.','Justificar el caudal adoptado para el uso del local.');
 }
 return {ruleVersion:'1.0',balanceId:p.id,balanceName:p.nombre,generatedAt:new Date().toISOString(),findings,
 pending:['Confirmar fuente y vigencia de condiciones climáticas y transmitancias.','Verificar capacidad sensible y latente del equipo en condiciones reales.','Revisar caudales de impulsión, retorno, extracción y transferencia; balance de masa y presión.','Verificar filtración, pérdidas de carga y presión disponible.','Revisar planos, memoria, cómputo, electricidad y controles.','Definir TAB, pruebas, mantenimiento y criterios de recepción.'],
 scope:'Revisión automática de coherencia de entradas del balance. La documentación y el cumplimiento normativo requieren revisión con fuentes y evidencias.'};
}
function mergeBalances(existing,incoming){
 if(!Array.isArray(incoming))throw Error('Lista de balances inválida.');
 const result=JSON.parse(JSON.stringify(existing));
 for(const raw of incoming){const p=JSON.parse(JSON.stringify(validateBalance(raw)));const old=result.find(x=>x.id===p.id);
 if(old&&JSON.stringify(old)!==JSON.stringify(p)){p.id=p.id+'-recuperado-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);p.nombre+=' (recuperado)';}
 if(!result.some(x=>x.id===p.id))result.push(p);}
 return result;
}
const api={validateBalance,agenda,audit,mergeBalances,sections};
if(typeof module!=='undefined')module.exports=api;else root.TBWorkspace=api;
})(typeof window!=='undefined'?window:this);
