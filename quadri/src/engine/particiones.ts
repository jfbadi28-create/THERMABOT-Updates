import type {BuildingInput,RoomPartition,ProjectInput,Trace} from './types.ts';
import {EngineeringError,validateTree,numberOf,positive,trace,variable,calculated,datum} from './core.ts';
import {prepareEnvelope} from './geometria_edificio.ts';

// A shared physical area is declared once. Each face removes that area from
// its exterior host; its signed sensible transfer appears in both rooms.
export function resolvePartitions(building:BuildingInput):Map<string,RoomPartition[]> {
 validateTree(building);
 const result=new Map<string,RoomPartition[]>(),rooms=new Map(building.rooms.map(r=>[r.id,prepareEnvelope(r).input])),ids=new Set<string>(),pairs=new Set<string>();
 if(rooms.size!==building.rooms.length)throw new EngineeringError('Ambientes duplicados');
 for(const p of building.partitions||[]){
  if(!p.id?.trim()||ids.has(p.id))throw new EngineeringError('Partición sin ID o duplicada',p.name);ids.add(p.id);
  if(!p.name?.trim()||p.model!=='estacionario')throw new EngineeringError('Nombre o modelo de partición no válido',p.id);
  if(p.projectId!==building.projectId)throw new EngineeringError('Partición de otro proyecto',p.name);
  if(p.roomAId===p.roomBId)throw new EngineeringError('Elegí dos ambientes diferentes',p.name);
  const a=rooms.get(p.roomAId),b=rooms.get(p.roomBId);
  if(!a||!b)throw new EngineeringError('Ambiente de la partición inexistente',p.name);
  if(a.projectId!==building.projectId||b.projectId!==building.projectId)throw new EngineeringError('Ambientes de otro proyecto',p.name);
  const sa=a.surfaces.find(s=>s.id===p.surfaceAId),sb=b.surfaces.find(s=>s.id===p.surfaceBId);
  if(!sa||!sb)throw new EngineeringError('Muro vinculado inexistente',p.name);
  if([sa,sb].some(s=>s.kind==='roof'||numberOf(s.tilt,'°')!==90))throw new EngineeringError('Esta versión vincula muros verticales; no pisos ni cubiertas',p.name);
  positive(numberOf(p.area,'m²'),p.name+'.área');positive(numberOf(p.u,'W/(m²·K)'),p.name+'.U');
  const pair=[JSON.stringify([a.id,sa.id]),JSON.stringify([b.id,sb.id])].sort().join('|');
  if(pairs.has(pair))throw new EngineeringError('Estos dos muros ya tienen una partición compartida',p.name);pairs.add(pair);
  for(const [own,host,other] of [[a,sa,b],[b,sb,a]] as const){
   const list=result.get(own.id)||[];
   list.push({id:p.id,name:p.name,surfaceId:host.id,adjacentRoomId:other.id,adjacentRoomName:other.room,area:structuredClone(p.area),u:structuredClone(p.u),adjacentTemperature:structuredClone(other.quadri?.season==='invierno'?other.quadri.indoorWinter:other.climate.indoorTemperature),model:p.model});result.set(own.id,list);
  }
 }
 // Sum every connection sharing a host, including other neighbouring rooms.
 for(const [id,links] of result)partitionExterior(rooms.get(id)!,links);
 return result;
}

export function partitionExterior(input:ProjectInput,links:RoomPartition[]):{surfaces:ProjectInput['surfaces'];trace:Trace[]} {
 validateTree(links);const surfaces=structuredClone(input.surfaces),td:Trace[]=[],ids=new Set<string>();
 for(const p of links){if(ids.has(p.id))throw new EngineeringError('Partición duplicada',p.name);ids.add(p.id);if(p.adjacentRoomId===input.id||p.model!=='estacionario')throw new EngineeringError('Vínculo de partición no válido',p.name);positive(numberOf(p.area,'m²'),p.name);positive(numberOf(p.u,'W/(m²·K)'),p.name);numberOf(p.adjacentTemperature,'°C',p.name);if(!surfaces.some(s=>s.id===p.surfaceId))throw new EngineeringError('Muro vinculado inexistente',p.name);}
 for(const s of surfaces){const assigned=links.filter(p=>p.surfaceId===s.id);if(!assigned.length)continue;
  const opaque=numberOf(s.area,'m²'),shared=assigned.reduce((v,p)=>v+numberOf(p.area,'m²'),0),exterior=opaque-shared;
  if(exterior< -1e-8)throw new EngineeringError('La superficie compartida supera el área opaca disponible después de descontar ventanas',s.name,'PARTITION_EXCEEDS_HOST');
  s.area=datum(Math.max(0,exterior),'m²','calculado',s.id+'-exterior-area');
  td.push(trace(s.id+'-exterior-area','Superficie exterior de '+s.name,'Aexterior=Aopaca−Σ Aparticiones; tolerancia 1e-8 m²',{opaca:variable(input.surfaces.find(x=>x.id===s.id)!.area),compartidas:calculated(shared,'m²',assigned.map(p=>p.id).join(', '))},s.area.value,'m²','4,7'));
 }
 return {surfaces,trace:td};
}
