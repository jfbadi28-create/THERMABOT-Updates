import test from 'node:test';
import assert from 'node:assert/strict';
import {demoRoom,calculateBuilding} from '../src/engine/edificio.ts';
import {enableQuadri} from '../src/engine/quadri.ts';
import {exportWaterLoads,waterInputSignature,validateWaterResult,WATER_STEPS} from '../src/engine/integracion_agua.ts';
import type {BuildingInput} from '../src/engine/types.ts';
function results(){
 const room=enableQuadri(demoRoom());room.projectId='water-test';
 const input:BuildingInput={schemaVersion:1,projectId:'water-test',name:'Test integración',rooms:[room],partitions:[]};
 const summer=structuredClone(input),winter=structuredClone(input);
 summer.rooms[0].quadri!.season='verano';winter.rooms[0].quadri!.season='invierno';
 return {summer:calculateBuilding(summer),winter:calculateBuilding(winter),input};
}
test('agua consume resultados existentes de ambas estaciones sin mutarlos',()=>{
 const {summer,winter}=results(),before=structuredClone({summer,winter});
 const data=exportWaterLoads(summer,winter,'local',{revisado:false},'2026-10-07');
 assert.deepEqual({summer,winter},before);assert.equal(data.espacios.length,1);
 assert.equal(data.espacios[0].verano.total,Math.max(...summer.results[0].hours.map(h=>h.total)));
 assert.equal(data.espacios[0].invierno.total,Math.max(...winter.results[0].hours.map(h=>h.total)));
 assert.deepEqual(data.espacios[0].verano.perfil.map(h=>h.total),summer.results[0].hours.map(h=>h.total));
 assert.ok(data.espacios[0].procedencia.trace_ids.length);assert.equal(data.espacios[0].verano.unidad,'W');
});
test('base equipo transfiere demanda de equipo; local no cuenta aire exterior otra vez',()=>{
 const {summer,winter}=results();const local=exportWaterLoads(summer,winter,'local'),coil=exportWaterLoads(summer,winter,'equipo');
 assert.deepEqual(coil.espacios[0].verano.perfil.map(h=>h.total),summer.results[0].hours.map(h=>h.systemTotal));
 assert.ok(coil.espacios[0].verano.total>=local.espacios[0].verano.total);
});
test('firma detecta cambios de geometría y conserva cambio de estación',()=>{
 const {input}=results();const s=waterInputSignature(input),changed=structuredClone(input);
 changed.rooms[0].quadri!.season='invierno';assert.equal(waterInputSignature(changed),s);
 changed.rooms[0].geometry.length.value+=1;assert.notEqual(waterInputSignature(changed),s);
});
test('transferencia rechaza estaciones, proyectos y cargas inválidas',()=>{
 let {summer,winter}=results();winter.input.projectId='other';assert.throws(()=>exportWaterLoads(summer,winter,'local'),/proyectos distintos/);
 ({summer,winter}=results());winter.results[0].quadri!.season='verano';assert.throws(()=>exportWaterLoads(summer,winter,'local'),/verano e invierno/);
 ({summer,winter}=results());summer.results[0].hours[0].total=-1;assert.throws(()=>exportWaterLoads(summer,winter,'local'),/negativas/);
});
test('resultado hidráulico requiere proyecto y nueve pasos; permite revisar fallos',()=>{
 const data:any={schema:'thermabot.carrier-water.v1',proyecto:{id:'water-test'},input:{proyecto:{id:'water-test'}},apto:false,
  resultado:Object.fromEntries(WATER_STEPS.map(k=>[k,{error:'prueba'}])),diagnostico:{errores:['Catálogo incompleto'],warnings:[]},
  pasos:WATER_STEPS.map((clave,i)=>({paso:i+1,clave,estado:'bloqueado'}))};
 assert.doesNotThrow(()=>validateWaterResult(data,'water-test'));
 assert.throws(()=>validateWaterResult(data,'other'),/otro proyecto/);
 data.apto=true;assert.throws(()=>validateWaterResult(data,'water-test'),/contradictorio/);
 data.apto=false;data.pasos.pop();assert.throws(()=>validateWaterResult(data,'water-test'),/nueve pasos/);
});
test('exportación real Quadri produce contrato legible por la integración Python',()=>{
 const {summer,winter}=results();const data=exportWaterLoads(summer,winter,'local',{revisado:false},'2026-10-07');
 assert.equal(JSON.parse(JSON.stringify(data)).schema,'thermabot.water-loads.v1');
});
