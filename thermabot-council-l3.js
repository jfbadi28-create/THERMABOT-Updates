/* THERMABOT Council L3 — deterministic, evidence-aware advisory engine. No writes or network. */
(function(root){
'use strict';
const roles=Object.freeze(['HVAC','Eléctrica','Automatización','Normativa hospitalaria','Costos y constructibilidad']);
const clean=x=>String(x??'').trim();
const normal=x=>clean(x).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function portfolio(s){return {projects:Array.isArray(s?.projects)?s.projects:[],documents:Array.isArray(s?.documents)?s.documents:[],equipment:Array.isArray(s?.equipment)?s.equipment:[],milestones:Array.isArray(s?.milestones)?s.milestones:[]};}
function tokens(s){return new Set(normal(s).split(/[^a-z0-9]+/).filter(x=>x.length>3));}
function similarity(a,b){const ta=tokens(a),tb=tokens(b);if(!ta.size||!tb.size)return 0;let n=0;for(const x of ta)if(tb.has(x))n++;return n/Math.sqrt(ta.size*tb.size);}
function memories(data,projectId,limit=5){
 const p=portfolio(data),focus=p.projects.find(x=>x.id===projectId);if(!focus)return [];
 const query=[focus.name,focus.system,focus.sector].join(' ');
 return p.projects.filter(x=>x.id!==projectId).map(x=>({projectId:x.id,project:x.name,establishment:x.establishment||'',similarity:similarity(query,[x.name,x.system,x.sector].join(' ')),status:x.status||null,source:x.sourceDriveUrl||null,explanation:'Similitud léxica entre nombre, sistema y sector; requiere verificar documentación'})).filter(x=>x.similarity>0).sort((a,b)=>b.similarity-a.similarity).slice(0,Math.max(0,Math.min(10,limit)));
}
function check(data,id){
 const s=portfolio(data),p=s.projects.find(x=>x.id===id);if(!p)return {ok:false,error:'Proyecto no encontrado'};
 const issues=[],roleFindings=[];
 function note(role,title,evidence,action,severity='pendiente'){const item={role,title,evidence,action,severity,evidenceType:'dato registrado o ausencia de dato',verified:false};roleFindings.push(item);issues.push(item);}
 if(!clean(p.system))note('HVAC','Sistema sin definir','Campo system vacío','Documentar tipo de sistema');
 if(!clean(p.specRevision))note('Normativa hospitalaria','Revisión documental ausente','Campo specRevision vacío','Identificar última revisión aprobada');
 if(!clean(p.nextAction))note('Costos y constructibilidad','Próxima acción ausente','Campo nextAction vacío','Registrar responsable y siguiente acción');
 if(clean(p.status)==='Finalizado'&&Number(p.progress)<100)note('Costos y constructibilidad','Estado y avance contradictorios','Finalizado con progreso '+p.progress+'%','Conciliar avance y cierre','inconsistencia');
 if(clean(p.status)==='Esperando tercero'&&!clean(p.waitingFor))note('Costos y constructibilidad','Tercero no identificado','Estado esperando tercero sin waitingFor','Identificar dependencia y seguimiento');
 if(/hepa|tmo|uti|quir[oó]fano|hospital/i.test([p.name,p.sector,p.system,p.establishment].join(' ')))note('Normativa hospitalaria','Validación clínica y normativa requerida','Proyecto hospitalario registrado','Revisar requisitos aplicables y evidencia documental antes de dictamen','alta');
 note('Eléctrica','Verificación eléctrica pendiente','Sin memoria eléctrica estructurada en esta vista','Verificar protecciones, demanda y continuidad');
 note('Automatización','Secuencias de control pendientes','Sin secuencia PLC/BMS estructurada en esta vista','Revisar estados de fallo, alarmas e interbloqueos');
 const cross=issues.filter(x=>x.role==='Normativa hospitalaria'||x.severity==='inconsistencia').map(x=>({between:['HVAC',x.role],issue:x.title,resolution:'Requiere evidencia independiente antes de cerrar el hallazgo'}));
 return {ok:true,project:{id:p.id,name:p.name,status:p.status,system:p.system},roles:roles.slice(),findings:roleFindings,crossReview:cross,memories:memories(data,id),limitations:['No sustituye revisión firmada','No se consultaron normas ni documentos externos','Los roles son reglas auditables, no cinco modelos independientes'],readOnly:true};
}
function scenario(input){
 const supply=Number(input?.supplyM3h),extract=Number(input?.extractM3h),volume=Number(input?.volumeM3);
 if(!Number.isFinite(supply)||!Number.isFinite(extract)||!Number.isFinite(volume)||supply<0||extract<0||volume<=0)return {ok:false,error:'Caudales no negativos y volumen positivo requeridos'};
 const balance=supply-extract,ach=supply/volume;
 return {ok:true,inputs:{supplyM3h:supply,extractM3h:extract,volumeM3:volume},ach:Number(ach.toFixed(2)),balanceM3h:Number(balance.toFixed(2)),interpretation:balance>0?'Balance de suministro positivo':balance<0?'Balance de suministro negativo':'Balance de suministro neutro',warning:'El balance de caudales NO determina por sí solo la presión diferencial en Pa, ni confirma filtración, humedad o cumplimiento hospitalario.'};
}
function alternatives(data,id){
 const c=check(data,id);if(!c.ok)return c;
 return {ok:true,projectId:id,options:[
 {name:'Conservar diseño',changes:[],needs:['Verificación de cálculo','Documentación vigente'],status:'No evaluada'},
 {name:'Revisar redundancia y automatización',changes:['Analizar estados de falla','Evaluar alarmas e interbloqueos'],needs:['Secuencia de operación','Disponibilidad de equipos'],status:'Hipótesis'},
 {name:'Comparar solución alternativa',changes:['Calcular demanda y consumo','Comparar inversión y mantenimiento'],needs:['Carga térmica','Cotizaciones','Horas de uso'],status:'Hipótesis'}
 ],applied:false,warning:'Opciones para estudio. No se modifica el proyecto ni se afirma que sean viables.'};
}
function report(data,id,scenarioInput){
 const c=check(data,id);if(!c.ok)return c;
 return {...c,scenarios:scenarioInput?scenario(scenarioInput):null,redesign:alternatives(data,id),decision:'EVALUACIÓN PRELIMINAR — evidencia insuficiente para dictamen de aptitud'};
}
root.ThermabotCouncilL3=Object.freeze({roles,memories,check,scenario,alternatives,report});
})(typeof window!=='undefined'?window:globalThis);
