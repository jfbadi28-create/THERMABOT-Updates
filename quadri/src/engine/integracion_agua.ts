import type {BuildingCalculation} from './types.ts'; // Existing thermal result contract, without recalculation.
import {validateImportedData} from './seguridad_datos.ts';

export const WATER_STEPS=['cargas_del_sistema','caudales_por_zona','seleccion_fcu','diversidad','dimensionamiento','bomba','tanque_de_expansion','soportes','validaciones'];
export const WATER_LABELS=['Cargas','Caudales','Fan-coils','Diversidad','Tuberías','Bomba','Tanque de expansión','Soportes','Validaciones'];
export function waterInputSignature(input:unknown):string {
 // Exact inputs, including shared partitions; season switch alone is neutral.
 const value=JSON.parse(JSON.stringify(input));
 for(const room of value.rooms||[])if(room.quadri)delete room.quadri.season;
 return JSON.stringify(value);
}
export function exportWaterLoads(summer:BuildingCalculation,winter:BuildingCalculation,base:'local'|'equipo',revision:unknown={},date=new Date().toISOString()){
 if(!['local','equipo'].includes(base))throw Error('Elegí cargas del local o del equipo.');
 if(summer.input.projectId!==winter.input.projectId)throw Error('Las estaciones corresponden a proyectos distintos.');
 if(summer.results.length!==winter.results.length||!summer.results.length)throw Error('Faltan ambientes de una estación.');
 const ids=new Set<string>();
 const espacios=summer.results.map(cold=>{
  if(ids.has(cold.input.id))throw Error('Ambiente duplicado.');ids.add(cold.input.id);
  const hot=winter.results.find(r=>r.input.id===cold.input.id);
  if(!hot)throw Error('Falta invierno: '+cold.input.room);
  if(cold.quadri?.season!=='verano'||hot.quadri?.season!=='invierno')throw Error('Se requieren resultados de verano e invierno.');
  const perfil=cold.hours.map(h=>({hora:h.hour,total:base==='local'?h.total:h.systemTotal,sensible:base==='local'?h.sensible:h.systemSensible}));
  const heat=hot.hours.map(h=>base==='local'?h.total:h.systemTotal);
  for(const h of perfil){
   if(!Number.isFinite(h.total)||!Number.isFinite(h.sensible)||h.total<0||h.sensible<0||h.sensible>h.total+1e-7)throw Error(cold.input.room+': cargas negativas/incoherentes; revisá la base térmica antes de transferir a agua.');
  }
  if(!perfil.length||!heat.length||heat.some(h=>!Number.isFinite(h)||h<0))throw Error(cold.input.room+': perfil térmico inválido.');
  const traceIds=[...new Set([...cold.trace,...hot.trace].map(t=>t.id))];
  if(!traceIds.length)throw Error('Falta trazabilidad: '+cold.input.room);
  return {id:cold.input.id,nombre:cold.input.room,
   verano:{unidad:'W',total:Math.max(...perfil.map(h=>h.total)),sensible:Math.max(...perfil.map(h=>h.sensible)),perfil},
   invierno:{unidad:'W',total:Math.max(...heat)},
   procedencia:{motor:cold.engineVersion,trace_ids:traceIds,verano_trazas:cold.trace,invierno_trazas:hot.trace,
    condiciones_aire:{verano:{temperatura_C:cold.states.room.temperature.value,rh_pct:cold.states.room.rh.value,bulbo_humedo_C:cold.states.room.wetBulb},invierno:{temperatura_C:hot.states.room.temperature.value}},
    notas:[...cold.warnings,...hot.warnings],base_carga:base}};
 });
 return {schema:'thermabot.water-loads.v1',proyecto:{id:summer.input.projectId,nombre:summer.input.name},fecha:date,motor:summer.results[0].engineVersion,
  base_carga:base,firma_entradas:waterInputSignature(summer.input),revision,espacios};
}
export function validateWaterResult(data:any,projectId:string):void {
 validateImportedData(data);
 if(!data||data.schema!=='thermabot.carrier-water.v1'||!data.resultado||!data.input)throw Error('No es un resultado de Carrier Water.');
 if(data.proyecto?.id!==projectId||data.input.proyecto?.id!==projectId)throw Error('El resultado pertenece a otro proyecto.');
 if(typeof data.apto!=='boolean'||!Array.isArray(data.pasos)||data.pasos.length!==9)throw Error('Resultado incompleto: se requieren los nueve pasos.');
 const finite=(v:any):boolean=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 for(let i=0;i<9;i++){
  const step=data.pasos[i];
  if(step.paso!==i+1||step.clave!==WATER_STEPS[i]||!['ok','error','bloqueado'].includes(step.estado)||!data.resultado[step.clave])throw Error('Secuencia hidráulica inválida.');
 }
 if(!Array.isArray(data.diagnostico?.errores)||!Array.isArray(data.diagnostico?.warnings))throw Error('Falta diagnóstico.');
 if(!data.apto)return; // Failed calculations can be inspected, but never shown as usable results.
 if(data.pasos.some((s:any)=>s.estado!=='ok')||data.diagnostico.errores.length)throw Error('Resultado contradictorio: apto con errores.');
 const r=data.resultado;
 if(!finite(r.cargas_del_sistema.Q_refrig_btuh)||!finite(r.tanque_de_expansion.V_tanque_gal)||!Array.isArray(r.dimensionamiento.secciones)||!Array.isArray(r.soportes.soportes))throw Error('Resultados numéricos incompletos.');
 for(const s of ['frio','calef'])if(!finite(r.bomba[s]?.Q_gpm)||!finite(r.bomba[s]?.H_ft))throw Error('Punto de bomba inválido.');
 if(!r.seleccion_fcu.selecciones||!finite(r.diversidad.gpm_bomba_frio)||!finite(r.diversidad.gpm_bomba_calef))throw Error('Falta selección/caudal.');
 for(const s of r.dimensionamiento.secciones)if(!s||typeof s.id!=='string'||typeof s.nps!=='string'||!finite(s.gpm_diseno)||!finite(s.v_fps)||!finite(s.dh_ft))throw Error('Tramo hidráulico inválido.');
 const visit=(v:any)=>{if(typeof v==='number'&&!Number.isFinite(v))throw Error('Resultado contiene NaN/Infinity.');if(v&&typeof v==='object')for(const c of Object.values(v))visit(c);};visit(data);
}
