import {calculateQuadri} from './quadri.ts';
import type {ProjectInput,Calculation,HourResult,Trace,Warning,FactorSet,RoomPartition} from './types.ts';
import {ENGINE_VERSION,datum,numberOf,nonnegative,trace,variable,calculated,uniqueWarnings,validateTree,EngineeringError} from './core.ts';
import {airState,atmosphericPressure} from './psicrometria.ts';
import {geometry,opaqueLoad,windowLoad,partition} from './envolvente.ts';
import {internalLoads} from './cargas_internas.ts';
import {infiltrationFlow,outdoorLoad,supplyFlow,moistureGeneration} from './ventilacion.ts';
import {factorErrors,constructionErrors} from './rts.ts';
import {prepareEnvelope} from './geometria_edificio.ts';
import {partitionExterior} from './particiones.ts';
export function calculate(source:ProjectInput,links:RoomPartition[]=[]):Calculation {
 if(source.quadri)return calculateQuadri(source,links);
 const prepared=prepareEnvelope(source),input=prepared.input;
 validateTree(input);
 if(input.schemaVersion!==2||input.history!=='periodico'||!['RTS','instantaneo'].includes(input.requestedMode)||!['instantaneo','error'].includes(input.fallback)||!['sistema','ambiente'].includes(input.ventilationDestination))throw new EngineeringError('Esquema, modo o configuración incompatible');
 const exterior=partitionExterior(input,links),warnings:Warning[]=[],td:Trace[]=[...prepared.trace,...exterior.trace];
 if(links.length)warnings.push({code:'PARTITION_STEADY_STATE',path:'particiones',message:'Particiones: U·A·(Tadyacente−Tinterior), régimen estacionario con temperaturas interiores de diseño constantes durante 24 h. Sin almacenamiento en el muro ni transferencia de aire/humedad.'});
 const pending=[['personas',input.internals.people.count],['iluminación',input.internals.lights.installedPower],['equipos',input.internals.equipment.inputPower],['infiltración',input.infiltrationACH],['ventilación',input.outdoorFlow]].filter(([,d])=>typeof d!=='string'&&d.source.startsWith('Pendiente'));
 if(pending.length)warnings.push({code:'PENDING_ROOM_DATA',path:input.room,message:'Carga inicial incompleta: revisar '+pending.map(([name])=>name).join(', ')+'. Los ceros iniciales no son un diseño verificado.'});
 let mode=input.requestedMode;
 if(mode==='RTS'){
  const required:[string,FactorSet|undefined][]=[['cargas-internas.rts',input.factors.rts]];
  exterior.surfaces.filter(s=>s.area.value>0).forEach(s=>{required.push([s.id+'.cts',s.factors?.cts||input.factors.cts],[s.id+'.rts',s.factors?.rts||input.factors.rts]);});
  input.windows.forEach(w=>{required.push([w.id+'.rts',w.factors?.rts||input.factors.rts],[w.id+'.solarRts',w.factors?.solarRts||input.factors.solarRts]);});
  const invalid=required.map(([path,f])=>({path,errors:factorErrors(f)})).filter(x=>x.errors.length);
  for(const s of exterior.surfaces.filter(s=>s.area.value>0)){const errors=constructionErrors(s,s.factors?.cts||input.factors.cts);if(errors.length)invalid.push({path:s.id+'.cts',errors});}
  if(invalid.length){if(input.fallback==='error')throw new EngineeringError('factores no válidos: '+invalid.map(x=>x.path+': '+x.errors.join(', ')).join('; '),'factors','INVALID_FACTORS');mode='instantaneo';invalid.forEach(x=>warnings.push({code:'INVALID_FACTORS',path:x.path,message:'warning: factores no válidos — '+x.errors.join(', ')+'. Se usa modo instantáneo para toda la cadena.'}));}
 }
 const c=input.climate;
 if(c.temperature.length!==24||c.rh.length!==24)throw new EngineeringError('Clima requiere 24 estados horarios','clima');
 const p=c.pressure?{value:c.pressure,trace:[],warnings:[]}:atmosphericPressure(c.location.altitude);td.push(...p.trace);
 const out=c.temperature.map((t,h)=>airState(t,c.rh[h],p.value,'out-'+h)),room=airState(c.indoorTemperature,c.indoorRH,p.value,'room'),supply=airState(c.supplyTemperature,c.supplyRH,p.value,'supply');
 [room,supply,...out].forEach(s=>{td.push(...s.trace);warnings.push(...s.warnings);});
 const geo=geometry(input.geometry.length,input.geometry.width,input.geometry.height);td.push(...geo.trace);
 const components:Record<string,{sensible:number[];latent:number[]}>= {};
 const zero=()=>Array(24).fill(0) as number[];
 const combine=(key:string,sensible:number[],latent:number[]=zero())=>{if(!components[key])components[key]={sensible:zero(),latent:zero()};sensible.forEach((v,h)=>components[key].sensible[h]+=v);latent.forEach((v,h)=>components[key].latent[h]+=v);};
 for(const s of exterior.surfaces.filter(s=>s.area.value>0)){const r=opaqueLoad(s,c,input.factors,mode,input.fallback);td.push(...r.trace);warnings.push(...r.warnings);combine('envolvente',r.sensible);}
 for(const p of links){const r=partition(p.u,p.area,Array.from({length:24},()=>p.adjacentTemperature),c.indoorTemperature);r.trace.forEach(t=>{t.id='partition-'+p.id;t.label=p.name+' · '+p.adjacentRoomName+' → '+input.room;t.variables.ambienteAdyacente=calculated(p.adjacentRoomName,'1',p.adjacentRoomId);t.variables.Tadj=variable(p.adjacentTemperature);t.equation='qpart(t)=U A [Tadj−Ti]; condiciones constantes 24 h; positivo hacia el ambiente';});td.push(...r.trace);combine('particiones',r.value);}
 for(const w of input.windows){const r=windowLoad(w,c,input.factors,mode,input.fallback);td.push(...r.trace);warnings.push(...r.warnings);if(r.parts){combine('envolvente',r.parts.conduction);combine('solar-vidrios',r.parts.solar);}else combine('ventanas',r.sensible);}
 const intern=internalLoads(input.internals,input.factors,mode,input.fallback);td.push(...intern.trace);warnings.push(...intern.warnings);Object.entries(intern.components).forEach(([key,v])=>combine(key,v.sensible,v.latent));
 const inf=infiltrationFlow(input.infiltrationACH,datum(geo.value.volume,'m³','calculado','geometry.volume'));td.push(...inf.trace);
 const infLoads=out.map((s,h)=>outdoorLoad(inf.value,s,room,'infiltration-'+h)),oaLoads=out.map((s,h)=>outdoorLoad(input.outdoorFlow,s,room,'ventilation-'+h));[...infLoads,...oaLoads].forEach(r=>td.push(...r.trace));
 combine('infiltracion',infLoads.map(r=>r.value.sensible),infLoads.map(r=>r.value.latent));
 if(input.ventilationDestination==='ambiente')combine('ventilacion-directa',oaLoads.map(r=>r.value.sensible),oaLoads.map(r=>r.value.latent));
 const ss=nonnegative(numberOf(input.systemSensible,'W'),'extras sensible'),sl=nonnegative(numberOf(input.systemLatent,'W'),'extras latente');
 const hours:HourResult[]=Array.from({length:24},(_,h)=>{
  const parts=Object.fromEntries(Object.entries(components).map(([k,v])=>[k,{sensible:v.sensible[h],latent:v.latent[h]}]));
  const sensible=Object.values(parts).reduce((a,b)=>a+b.sensible,0),latent=Object.values(parts).reduce((a,b)=>a+b.latent,0),total=sensible+latent;
  for(const [key,v] of Object.entries(parts))td.push(trace('component-'+key+'-'+h,'Contribución '+key+' · '+h+' h','Qcomponente(t)=Qs,componente(t)+Ql,componente(t)',{hora:calculated(h,'h','Hora civil'),Qs:calculated(v.sensible,'W','Perfil sensible '+key),Ql:calculated(v.latent,'W','Perfil latente '+key),perfilSensible:calculated(components[key].sensible,'W','Suma de cargas horarias de '+key),perfilLatente:calculated(components[key].latent,'W','Suma de cargas horarias de '+key)},v.sensible+v.latent,'W','17'));
  td.push(trace('zone-sensible-'+h,'Carga sensible del ambiente · '+h+' h','Qs,zona(t)=Σ Qs,componentes(t)',Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,calculated(v.sensible,'W','component-'+k+'-'+h)])),sensible,'W','17'),trace('zone-latent-'+h,'Carga latente del ambiente · '+h+' h','Ql,zona(t)=Σ Ql,componentes(t)',Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,calculated(v.latent,'W','component-'+k+'-'+h)])),latent,'W','17'));
  const central=input.ventilationDestination==='sistema';
  const systemSensible=sensible+(central?oaLoads[h].value.sensible:0)+intern.returnHeat[h]+ss,systemLatent=latent+(central?oaLoads[h].value.latent:0)+sl;
  const hr=[trace('zone-'+h,'Carga total del ambiente · '+h+' h','Qt,zona(t)=ΣQs,componentes(t)+ΣQl,componentes(t)',Object.fromEntries(Object.entries(parts).flatMap(([k,v])=>[[k+'-s',calculated(v.sensible,'W','Componente '+k)],[k+'-l',calculated(v.latent,'W','Componente '+k)]])),total,'W','17'),trace('system-'+h,'Carga conjunta del sistema · '+h+' h','Qsys=Qzona+Qvent_central+Qreturn_luces+Qextras',{Qzona:calculated(total,'W','zone-'+h),Qvent:calculated(central?oaLoads[h].value.total:0,'W',central?'ventilation-'+h:'Ya incluida en ambiente'),Qreturn:calculated(intern.returnHeat[h],'W','lights-return'),extraSensible:variable(input.systemSensible),extraLatente:variable(input.systemLatent)},systemSensible+systemLatent,'W','14,22')];td.push(...hr);
  return {hour:h,sensible,latent,total,systemSensible,systemLatent,systemTotal:systemSensible+systemLatent,coilDemand:systemSensible+systemLatent,components:parts,trace:hr};
 });
 const peak=hours.reduce((a,b)=>b.total>a.total?b:a),systemPeak=hours.reduce((a,b)=>b.systemTotal>a.systemTotal?b:a);
 td.push(trace('peak','Pico simultáneo del ambiente','tpeak=argmax_t Σ componentes(t)',{perfil:calculated(hours.map(h=>h.total),'W','zone-0…zone-23')},peak.total,'W','17'),trace('system-peak','Pico simultáneo del sistema','tpeak,sys=argmax_t Qsys(t)',{perfil:calculated(hours.map(h=>h.systemTotal),'W','system-0…system-23')},systemPeak.systemTotal,'W','22'));
 let flow:number|null=null,water:number|null=null,latentCheck:boolean|null=null;
 if(peak.sensible>=0&&numberOf(c.supplyTemperature,'°C')<numberOf(c.indoorTemperature,'°C')){
  const r=supplyFlow(datum(peak.sensible,'W','calculado','zone-'+peak.hour),room,supply);td.push(...r.trace);flow=r.value.volume;water=r.value.waterRemoved;
  const net=hours.map((hr,h)=>{const g=moistureGeneration(intern.components.personas.latent[h]/2501000,intern.components.equipos.latent[h]/2501000,infLoads[h].value.mass,out[h],room,input.ventilationDestination==='ambiente'?oaLoads[h].value.mass:0);g.trace.forEach(t=>t.id+='-'+h);td.push(...g.trace);return g.value;});
  const needed=Math.max(...net);latentCheck=water+1e-10>=needed;
  td.push(trace('latent-verification','Verificación de humedad para todas las horas','mdot_water,removed ≥ max_t(mdot_water,net)',{capacidad:calculated(water,'kg_w/s','water-removed'),generacion:calculated(net,'kg_w/s','water-net-0…water-net-23')},latentCheck?1:0,'1','20'));
  if(!latentCheck)warnings.push({code:'LATENT_NOT_MET',path:'supply',message:'La impulsión calculada por sensible no alcanza para retirar la humedad neta de todas las horas.'});
 }else warnings.push({code:'NO_SUPPLY_FLOW',path:'supply',message:'No se calcula impulsión: requiere carga sensible no negativa y Tsupply < Troom.'});
 warnings.push({code:'SUPPLY_NOT_FINAL',path:'supply',message:'Impulsión por carga sensible: falta verificar ACH, distribución, proceso y presurización con datos del proyecto.'});
 warnings.push({code:'SYSTEM_DEMAND_NOT_COIL_STATE',path:'system',message:'Carga conjunta del sistema. La batería por entalpías requiere estados reales de mezcla/salida y ubicación del ventilador; no se infiere capacidad nominal.'});
 const hasAssumptions=JSON.stringify(input).includes('"provenance":"supuesto"');if(hasAssumptions)warnings.push({code:'ASSUMED_INPUTS',path:'input',message:'Hay hipótesis/datos de demostración. Revisar la procedencia antes de usar el resultado en un proyecto real.'});
 td.push(trace('mode','Método efectivamente ejecutado','Modo declarado; sin mezclar cadenas no documentadas',{pedido:calculated(input.requestedMode,'1','Configuración'),ejecutado:calculated(mode,'1','Validación CTS/RTS')},null,'1','1,25',warnings.filter(w=>w.code==='INVALID_FACTORS').map(w=>w.message)));
 return {input,engineVersion:ENGINE_VERSION,mode:links.length&&mode==='RTS'?'mixto':mode,hours,peak,systemPeak,states:{outdoor:out,room,supply},supplyFlow:flow,moistureRemoval:water,latentCheck,warnings:uniqueWarnings(warnings),trace:td};
}
