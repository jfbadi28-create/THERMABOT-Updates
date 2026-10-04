import type {ProjectInput,Surface,Trace} from './types.ts';
import {datum,numberOf,positive,nonnegative,range,trace,variable,calculated,EngineeringError,validateTree} from './core.ts';

export function grossSurfaceArea(s:Surface,input:ProjectInput):number {
 const mode=s.areaMode||'manual',l=positive(numberOf(input.geometry.length,'m'),'largo'),w=positive(numberOf(input.geometry.width,'m'),'ancho'),h=positive(numberOf(input.geometry.height,'m'),'altura');
 if(!['manual','long-wall','short-wall','floor'].includes(mode))throw new EngineeringError('Modo de área no válido',s.id);
 return mode==='long-wall'?l*h:mode==='short-wall'?w*h:mode==='floor'?l*w:nonnegative(numberOf(s.grossArea||s.area,'m²'),s.id+'.area-bruta');
}

// Old v2 inputs contain net opaque areas and independent windows. Preserve those
// until an explicit migration builds gross area + window-to-host relationships.
export function prepareEnvelope(source:ProjectInput):{input:ProjectInput;trace:Trace[]} {
 validateTree(source);
 const input=structuredClone(source),td:Trace[]=[],ids=new Set<string>();
 for(const item of [...input.surfaces,...input.windows]){if(typeof item.id!=='string'||!item.id.trim()||ids.has(item.id))throw new EngineeringError('Identificador vacío o duplicado',item.id||'cerramiento');ids.add(item.id);}
 for(const win of input.windows){
  if(!win.parentId){if(input.surfaces.some(s=>s.grossArea))throw new EngineeringError('La ventana debe estar vinculada a un cerramiento',win.name);continue;}
  const host=input.surfaces.find(s=>s.id===win.parentId);
  if(!host)throw new EngineeringError('El cerramiento de la ventana no existe',win.name);
  if(!host.grossArea)throw new EngineeringError('El cerramiento vinculado requiere área bruta explícita',host.name);
  win.azimuth=datum(numberOf(host.azimuth,'°'),'°','heredado','Orientación del cerramiento '+host.id);
  win.tilt=datum(numberOf(host.tilt,'°'),'°','heredado','Inclinación del cerramiento '+host.id);
  td.push(trace(win.id+'-orientation','Orientación de '+win.name,'azimut_ventana=azimut_cerramiento; inclinación_ventana=inclinación_cerramiento',{azimut:variable(host.azimuth),inclinacion:variable(host.tilt)},[win.azimuth.value,win.tilt.value],'°','4,5'));
 }
 for(const s of input.surfaces){
  range(numberOf(s.azimuth,'°'),-180,180,s.name+'.azimut');range(numberOf(s.tilt,'°'),0,180,s.name+'.inclinación');
  if(!s.grossArea)continue;
  const mode=s.areaMode||'manual',gross=grossSurfaceArea(s,input),openings=input.windows.filter(w=>w.parentId===s.id),areas=openings.map(w=>nonnegative(numberOf(w.area,'m²'),w.name+'.area'));
  const net=gross-areas.reduce((a,b)=>a+b,0);
  if(net < -1e-8)throw new EngineeringError('Las ventanas superan el área bruta del cerramiento',s.name,'OPENINGS_EXCEED_HOST');
  s.grossArea=mode==='manual'?s.grossArea:datum(gross,'m²','calculado',mode==='long-wall'?'largo × altura':mode==='short-wall'?'ancho × altura':'largo × ancho');
  s.area=datum(Math.max(0,net),'m²','calculado',s.id+'-net-area');
  if(mode!=='manual')td.push(trace(s.id+'-gross-area','Área bruta de '+s.name,mode==='long-wall'?'Abruta=largo×altura':mode==='short-wall'?'Abruta=ancho×altura':'Abruta=largo×ancho',{largo:variable(input.geometry.length),ancho:variable(input.geometry.width),altura:variable(input.geometry.height)},gross,'m²','4'));
  td.push(trace(s.id+'-net-area','Área opaca neta de '+s.name,'Aneta=Abruta−Σ Aventanas; tolerancia de redondeo 1e-8 m²',{bruta:variable(s.grossArea),aberturas:calculated(areas,'m²',openings.map(w=>w.id).join(', ')||'Sin ventanas vinculadas')},s.area.value,'m²','4'));
 }
 return {input,trace:td};
}

export function migrateEnvelope(source:ProjectInput):ProjectInput {
 const input=structuredClone(source);
 if(input.surfaces.every(s=>s.grossArea))return input;
 for(const w of input.windows){if(!w.parentId){const host=input.surfaces.find(s=>Math.abs(numberOf(s.azimuth,'°')-numberOf(w.azimuth,'°'))<1e-6&&Math.abs(numberOf(s.tilt,'°')-numberOf(w.tilt,'°'))<1e-6);if(host)w.parentId=host.id;}}
 for(const s of input.surfaces){if(s.grossArea)continue;const openings=input.windows.filter(w=>w.parentId===s.id).reduce((a,w)=>a+numberOf(w.area,'m²'),0);s.grossArea=datum(numberOf(s.area,'m²')+openings,'m²','calculado','Migración v2: área opaca neta + ventanas vinculadas');s.areaMode='manual';s.kind=numberOf(s.tilt,'°')===0?'roof':'wall';}
 return input;
}
