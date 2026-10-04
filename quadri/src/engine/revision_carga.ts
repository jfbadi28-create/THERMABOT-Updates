import type {ProjectInput} from './types.ts';
export type ReviewSection='clima'|'envolvente'|'internas'|'aire';
export type RoomReview=Partial<Record<ReviewSection,string>>;
export const REVIEW_SECTIONS:{id:ReviewSection;name:string;step:number}[]=[
 {id:'clima',name:'Ubicación y clima',step:0},
 {id:'envolvente',name:'Geometría, materiales y ventanas',step:1},
 {id:'internas',name:'Personas, iluminación y equipos',step:2},
 {id:'aire',name:'Ventilación e infiltración',step:3}
];
// Store the exact reviewed inputs, not a global boolean: edits invalidate only
// their section. Both seasons are reviewed together; switching season is neutral.
export function reviewSignature(i:ProjectInput,section:ReviewSection,partitions:unknown[]=[]):string {
 const q=i.quadri!;
 const payload=section==='clima'?[i.room,i.climate.location,i.climate.indoorTemperature,i.climate.indoorRH,q.city,q.outdoorSummer,q.rhSummer,q.outdoorWinter,q.rhWinter,q.indoorWinter,q.dailyRange,q.solarBasis]:
 section==='envolvente'?[i.geometry,i.surfaces.map(s=>[s.id,s.name,s.kind,s.areaMode,s.grossArea,s.u,s.azimuth,s.tilt,s.quadriMaterial,s.quadriBoundary,s.quadriDelta]),i.windows.map(w=>[w.id,w.name,w.parentId,w.area,w.u,w.quadriMaterial,w.quadriC,w.quadriShading,w.sunlitFraction]),q.floorMode,q.floorK,q.groundT,partitions]:
 section==='internas'?[i.internals,q.activity,q.lighting]:
 [i.outdoorFlow,i.infiltrationACH,i.climate.supplyTemperature,q.winterSupply,q.ventMode,q.outsidePct,q.minPerPerson,q.flowMode,q.adoptedFlow,q.ductSummer,q.zd,q.zhMode,q.zh,q.zc,q.humidityMode,q.he,q.hi];
 return JSON.stringify(payload);
}
export function roomReview(i:ProjectInput,review:RoomReview={},partitions:unknown[]=[]){
 return REVIEW_SECTIONS.map(s=>({...s,reviewed:review[s.id]===reviewSignature(i,s.id,partitions)}));
}
