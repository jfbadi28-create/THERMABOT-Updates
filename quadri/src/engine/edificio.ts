import type {ProjectInput,BuildingInput,BuildingCalculation,Surface,Datum} from './types.ts';
import {datum,numberOf,trace,calculated,EngineeringError,validateTree,uniqueWarnings} from './core.ts';
import {calculate} from './index.ts';
import {migrateEnvelope,prepareEnvelope} from './geometria_edificio.ts';
import {demoInput} from './demo.ts';
import {resolvePartitions} from './particiones.ts';

export function demoRoom(projectId='colector'):ProjectInput {
 const r=migrateEnvelope(demoInput(projectId));
 r.surfaces.forEach(s=>s.areaMode=s.id==='roof'?'floor':s.id==='north'||s.id==='south'?'long-wall':'short-wall');
 return prepareEnvelope(r).input;
}

function normalizeAzimuth(value:number):number {
 let v=((value+180)%360+360)%360-180;
 if(Math.abs(v+180)<1e-9)v=180;
 return v;
}
function cardinalName(azimuth:number):string {
 const a=normalizeAzimuth(azimuth);
 if(Math.abs(Math.abs(a)-180)<1e-6)return 'Norte';
 if(Math.abs(a+90)<1e-6)return 'Este';
 if(Math.abs(a)<1e-6)return 'Sur';
 if(Math.abs(a-90)<1e-6)return 'Oeste';
 return a.toFixed(0)+'°';
}
function angularDistance(a:number,b:number):number {return Math.abs(normalizeAzimuth(a-b));}
export function rectangularizeRoom(source:ProjectInput,referenceSurfaceId:string|undefined,referenceAzimuth:number):ProjectInput {
 validateTree(source);const room=structuredClone(source);
 const l=numberOf(room.geometry.length,'m'),w=numberOf(room.geometry.width,'m'),h=numberOf(room.geometry.height,'m');
 if(!(l>0&&w>0&&h>0))throw new EngineeringError('Largo, ancho y altura deben ser mayores que cero');
 const target=normalizeAzimuth(referenceAzimuth);if(![180,-90,0,90].some(v=>Math.abs(normalizeAzimuth(v-target))<1e-6))throw new EngineeringError('La orientación automática admite Norte, Este, Sur u Oeste');
 const roofs=room.surfaces.filter(s=>s.kind==='roof'||s.tilt.value===0),walls=room.surfaces.filter(s=>!(s.kind==='roof'||s.tilt.value===0));
 if(walls.length>4)throw new EngineeringError('El ambiente tiene más de cuatro muros. Usá geometría manual / irregular para no perder cerramientos.');
 let reference=walls.find(s=>s.id===referenceSurfaceId)||walls[0];
 let createdReference=false;
 if(!reference){reference=structuredClone(demoInput(room.projectId).surfaces.find(s=>s.tilt.value>0)!);reference.id=room.id+'-rect-ref';createdReference=true;}
 const oldRefAz=numberOf(reference.azimuth,'°');
 let refMode:Surface['areaMode'];
 if(reference.areaMode==='long-wall'||reference.areaMode==='short-wall')refMode=reference.areaMode;
 else{
  let gross:number;try{gross=numberOf(reference.grossArea||reference.area,'m²');}catch{gross=l*h;}
  refMode=Math.abs(gross-l*h)<=Math.abs(gross-w*h)?'long-wall':'short-wall';
 }
 const otherMode:Surface['areaMode']=refMode==='long-wall'?'short-wall':'long-wall';
 const slots=[{offset:0,mode:refMode},{offset:90,mode:otherMode},{offset:180,mode:refMode},{offset:-90,mode:otherMode}] as const;
 const remaining=walls.filter(s=>s.id!==reference!.id),used=new Set<string>(),built:Surface[]=[];
 const inherit=(d:Datum,label:string):Datum=>({...structuredClone(d),provenance:'heredado',source:'Copiado de pared de referencia · '+label});
 for(const [index,slot] of slots.entries()){
  let wall:Surface|undefined;
  if(index===0)wall=reference;
  else{
   let best:Surface|undefined,bestD=Infinity;
   for(const candidate of remaining){if(used.has(candidate.id))continue;const rel=normalizeAzimuth(numberOf(candidate.azimuth,'°')-oldRefAz),d=angularDistance(rel,slot.offset);if(d<bestD){best=candidate;bestD=d;}}
   if(best){wall=best;used.add(best.id);}
  }
  const isNew=!wall||createdReference&&index===0;
  if(!wall){wall=structuredClone(reference);wall.id=room.id+'-rect-'+index;}
  if(isNew||wall.id.startsWith(room.id+'-rect-')){
   for(const key of ['u','absorptance','exteriorH','emissivity','longwave','radiantFraction'] as const)wall[key]=inherit(reference[key],reference.name);
   delete wall.quadriMaterial;delete wall.quadriDelta;
  }
  const az=normalizeAzimuth(target+slot.offset);
  wall.kind='wall';wall.areaMode=slot.mode;wall.name='Muro '+cardinalName(az);
  wall.azimuth=datum(az,'°',index===0?'ingresado':'calculado',index===0?'Pared de referencia orientada por el usuario':'Orientación derivada a 90° de la pared de referencia');
  wall.tilt=datum(90,'°','calculado','Muro vertical de recinto rectangular');
  wall.grossArea=datum(0,'m²','calculado',slot.mode==='long-wall'?'largo × altura':'ancho × altura');
  built.push(wall);
 }
 room.surfaces=[...built,...roofs];
 return prepareEnvelope(room).input;
}

export function createRoom(template:ProjectInput,id:string,name:string,length:number,width:number,height:number):ProjectInput {
 const room=structuredClone(template);room.id=id;room.room=name.trim();room.name='Balance · '+room.room;
 if(!room.room)throw new EngineeringError('Ingresá el nombre del ambiente');
 const inherited=(d:Datum)=>({...structuredClone(d),provenance:'heredado' as const,source:'Copiado de '+template.room+' · '+d.source});
 room.geometry={length:datum(length,'m','ingresado','Largo del nuevo ambiente'),width:datum(width,'m','ingresado','Ancho del nuevo ambiente'),height:datum(height,'m','ingresado','Altura del nuevo ambiente')};
 const wall=template.surfaces.find(s=>s.kind!=='roof'&&s.tilt.value>0)||demoInput().surfaces[0],roof=template.surfaces.find(s=>s.kind==='roof'||s.tilt.value===0)||demoInput().surfaces[4];
 room.surfaces=[['Norte',180,'long-wall'],['Este',-90,'short-wall'],['Sur',0,'long-wall'],['Oeste',90,'short-wall'],['Cubierta',0,'floor']].map(([label,az,mode],n)=>{
  const src=n===4?roof:wall,s=structuredClone(src);s.id=id+'-surface-'+n;s.name=n===4?'Cubierta':'Muro '+label;s.kind=n===4?'roof':'wall';s.areaMode=mode as Surface['areaMode'];s.grossArea=datum(0,'m²','calculado','Área desde dimensiones');s.area=datum(0,'m²','calculado','Pendiente de geometría');
  for(const key of ['u','absorptance','exteriorH','emissivity','longwave','radiantFraction'] as const)s[key]=inherited(src[key]);
  s.tilt=datum(n===4?0:90,'°','ingresado','Cerramiento horizontal/vertical del recinto inicial');s.azimuth=datum(az as number,'°','ingresado','Orientación cardinal inicial editable');return s;
 });
 room.windows=[];
 room.internals.people.count=datum(0,'1','supuesto','Pendiente de cargar ocupación');room.internals.lights.installedPower=datum(0,'W','supuesto','Pendiente de cargar iluminación');room.internals.equipment.inputPower=datum(0,'W','supuesto','Pendiente de cargar equipos');
 room.infiltrationACH=datum(0,'ACH','supuesto','Pendiente de verificar infiltración');room.outdoorFlow=datum(0,'m³/h','supuesto','Pendiente de verificar ventilación');room.systemSensible=datum(0,'W','ingresado','Sin adicionales cargados');room.systemLatent=datum(0,'W','ingresado','Sin adicionales cargados');
 return prepareEnvelope(room).input;
}
function commonClimate(r:ProjectInput):string {
 if(r.quadri){const q=r.quadri;return JSON.stringify({season:q.season,city:q.city,te:q.season==='verano'?q.outdoorSummer.value:q.outdoorWinter.value,rh:q.season==='verano'?q.rhSummer.value:q.rhWinter.value,dailyRange:q.dailyRange,solarBasis:q.solarBasis,latitude:r.climate.location.latitude.value,pressure:r.climate.pressure?.value,alt:r.climate.location.altitude.value});}
 const c=r.climate,l=c.location,rad=c.radiation;
 return JSON.stringify({year:l.year,day:l.day,lat:numberOf(l.latitude,'°'),lon:numberOf(l.longitude,'°'),tz:numberOf(l.timezone,'h'),alt:numberOf(l.altitude,'m'),pressure:c.pressure?numberOf(c.pressure,'Pa'):null,t:c.temperature.map(v=>numberOf(v,'°C')),rh:c.rh.map(v=>numberOf(v,'1')),radiation:{mode:rad.mode,model:rad.transposition,dni:rad.mode==='manual'?rad.dni.map(v=>numberOf(v,'W/m²')):[],dhi:rad.mode==='manual'?rad.dhi.map(v=>numberOf(v,'W/m²')):[],tb:rad.mode==='tau'&&rad.tauBeam?numberOf(rad.tauBeam,'1'):null,td:rad.mode==='tau'&&rad.tauDiffuse?numberOf(rad.tauDiffuse,'1'):null,albedo:numberOf(rad.albedo,'1')}});
}
export function calculateBuilding(input:BuildingInput):BuildingCalculation {
 validateTree(input);if(input.schemaVersion!==1||!Array.isArray(input.rooms)||!input.rooms.length)throw new EngineeringError('El edificio requiere al menos un ambiente');
 const ids=new Set<string>(),shared=commonClimate(input.rooms[0]);
 for(const r of input.rooms){if(!r.id?.trim()||ids.has(r.id))throw new EngineeringError('Ambiente sin ID o duplicado',r.room);ids.add(r.id);if(r.projectId!==input.projectId)throw new EngineeringError('El ambiente pertenece a otro proyecto',r.room);if(commonClimate(r)!==shared)throw new EngineeringError('Los ambientes requieren el mismo clima exterior, ubicación y fecha para sumar cargas simultáneas',r.room,'INCOMPATIBLE_CLIMATE');}
 const links=resolvePartitions(input),results=input.rooms.map(r=>calculate(r,links.get(r.id)||[])),td=results.map(r=>trace('room-peak-'+r.input.id,'Pico de '+r.input.room,'Qpico=max_t Qt,ambiente(t)',{perfil:calculated(r.hours.map(h=>h.total),'W',r.input.id+' · zone-0…23')},r.peak.total,'W','17'));
 for(const p of input.partitions||[]){const a=results.find(r=>r.input.id===p.roomAId)!,b=results.find(r=>r.input.id===p.roomBId)!,ta=a.trace.find(t=>t.id==='partition-'+p.id)!,tb=b.trace.find(t=>t.id==='partition-'+p.id)!;td.push({...ta,id:'partition-'+p.id+'-'+a.input.id},{...tb,id:'partition-'+p.id+'-'+b.input.id},trace('partition-'+p.id+'-conservation','Conservación · '+p.name,'qA(t)+qB(t)=0; transferencia interna, sin doble carga',{qA:calculated(ta.result as number[],'W',ta.id+' · '+a.input.room),qB:calculated(tb.result as number[],'W',tb.id+' · '+b.input.room)},(ta.result as number[]).map((v,h)=>v+(tb.result as number[])[h]),'W','7'));}
 for(const r of results)if(JSON.stringify(r.hours.map(h=>h.hour))!==JSON.stringify(results[0].hours.map(h=>h.hour)))throw new EngineeringError('Perfiles horarios incompatibles');
 const hours=results[0].hours.map(({hour})=>{const sensible=results.reduce((a,r)=>a+r.hours.find(h=>h.hour===hour)!.sensible,0),latent=results.reduce((a,r)=>a+r.hours.find(h=>h.hour===hour)!.latent,0);td.push(trace('building-'+hour,'Carga conjunta de ambientes · '+hour+' h','Qedificio(t)=Σ Qambiente,i(t)',Object.fromEntries(results.map(r=>[r.input.id,calculated(r.hours.find(h=>h.hour===hour)!.total,'W',r.input.room+' · zone-'+hour)])),sensible+latent,'W','17'));return {hour,sensible,latent,total:sensible+latent};});
 const peak=hours.reduce((a,b)=>b.total>a.total?b:a);td.push(trace('building-peak','Pico simultáneo de ambientes','Qpico,edificio=max_t Σ Qambiente,i(t)',{perfil:calculated(hours.map(h=>h.total),'W','building-0…23')},peak.total,'W','17'));
 return {input,results,hours,peak,area:results.reduce((a,r)=>a+numberOf(r.input.geometry.length,'m')*numberOf(r.input.geometry.width,'m'),0),volume:results.reduce((a,r)=>a+numberOf(r.input.geometry.length,'m')*numberOf(r.input.geometry.width,'m')*numberOf(r.input.geometry.height,'m'),0),trace:td,warnings:uniqueWarnings(results.flatMap(r=>r.warnings.map(w=>({...w,path:r.input.room+' · '+w.path}))).concat([{code:'BUILDING_ZONE_LOADS_ONLY',path:'edificio',message:'Suma de cargas de los ambientes; no incluye aire exterior tratado en una central ni equivale a selección de equipo.'}]))};
}
