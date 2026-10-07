import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuadri,quadriEquivalent,quadriOrientation,quadriPsych,enableQuadri,quadriSolar} from '../src/engine/quadri.ts';
import {quadriReference} from '../src/engine/casos_quadri.ts';
import {calculateBuilding,createRoom} from '../src/engine/edificio.ts';
import {datum,convert} from '../src/engine/core.ts';
import {humidityRatio} from '../src/engine/psicrometria.ts';
import {QUADRI_MATERIALS,QUADRI_CITIES} from '../src/engine/catalogo_quadri.ts';
const hour15=(i:any)=>calculateQuadri(i).quadri!.hours.find(h=>h.hour===15)!;
test('Quadri: planilla independiente verano pp.117–119, hora 15, todos los subtotales publicados',()=>{
 const h=hour15(quadriReference());assert.deepEqual([h.QSi,h.QLi,h.QTi,h.Qse,h.Qle,h.QTe,h.QT,h.QST,h.C,h.Ca],[9802,450,10252,2040,2016,4056,14308,11842,60,12]);assert.equal(h.FCS,9802/10252);
 const r=calculateQuadri(quadriReference());assert.equal(r.mode,'Quadri');assert.equal(r.hours.length,13);assert.equal(r.hours[0].hour,6);assert.equal(r.hours[12].hour,18);assert.equal(r.peak.hour,16);assert(r.trace.some(t=>t.source.includes('pp.102–103')));assert(!r.warnings.some(w=>w.code==='INVALID_FACTORS'));
});
test('Quadri: invierno pp.130–131, Qo=6566, Qt=8208, Qse=4488 y QT=12696',()=>{
 const h=hour15(quadriReference('invierno'));assert.deepEqual([h.Qo,h.Qt,h.Qse,h.QT,h.zh,h.QLi],[6566,8208,4488,12696,0,0]);assert.equal(calculateQuadri(quadriReference('invierno')).hours.length,1);assert.equal(h.FCS,null);assert.equal(h.PRA,null);assert(Math.abs(h.supplyT!-30.0470588235)<1e-8);
});
test('Ejemplo a las 10 h: corrección exterior 30°C, NE 6°C, vidrio I=408 y solar 2154 kcal/h',()=>{
 const r=calculateQuadri(quadriReference());assert.equal(r.states.outdoor[r.hours.findIndex(h=>h.hour===10)].temperature.value,30);assert.equal(r.trace.find(t=>t.id==='vidrio-ne-solar-10')!.result,2154);assert.equal(r.trace.find(t=>t.id==='ne-load-10')!.result,179);assert.equal(r.trace.find(t=>t.id==='techo-load-10')!.result,648);
});
test('Cuadro 3-III usa base ΔT=10 y aplica 1 °C de corrección por cada 1 °C de diferencia de diseño',()=>{
 const cases=[[8,11,-2],[10,13,0],[12,15,2],[14,17,4]] as const;
 for(const [dt,value,correction] of cases){const r=quadriEquivalent('NE',1.62,15,dt);assert.equal(r.value,value);assert.equal(r.correction,correction);}
 const a=quadriReference(),b=structuredClone(a);b.windows[0].shgcBeam.value=.01;b.windows[0].shgcDiffuse.value=.01;assert.equal(hour15(a).QT,hour15(b).QT);
 const calc=calculateQuadri(a),trace=calc.trace.find(x=>x.id==='ne-load-15')!;assert.equal(trace.variables.correccionDiseno.value,1);assert.equal(trace.variables.correccionDiseno.source,'Corrección Quadri: (Te15−Ti)−10');
});
test('Rosario, K direccional de losa y conversiones del manual',()=>{
 assert.deepEqual(QUADRI_CITIES[0],{id:'rosario',name:'Rosario',summerT:36,summerRH:40,winterT:.4,winterRH:80});assert.equal(QUADRI_MATERIALS.find(x=>x.id==='losa1-20')!.winter,2.6);assert.equal(QUADRI_MATERIALS.find(x=>x.id==='losa1-20')!.summer,2.1);assert.equal(convert(1000,'W','kcal/h'),860);assert.equal(convert(60,'m³/min','m³/h'),3600);assert(Math.abs(convert(5,'kcal/(h·m²·°C)','W/(m²·K)')-5/.86)<1e-10);
 const i=quadriReference();i.surfaces[3].quadriMaterial='losa1-20';const summer=calculateQuadri(i);i.quadri!.season='invierno';const winter=calculateQuadri(i);assert.equal(summer.trace.find(x=>x.id==='techo-load-15')!.variables.K.value,2.1);assert.equal(winter.trace.find(x=>x.id==='techo-load-15')!.variables.K.value,2.6);
});
test('Psicrometría: caso gráfico pp.82–83, PRA≈11.5°C y PRS≈11°C, sin confundir rocío del aire',()=>{
 const p=101325,wA=humidityRatio(25,.5,p)*1000,wE=humidityRatio(35,.4,p)*1000,C=50,qs=17*C*(25-13.8),ql=qs*.2/.8,result=quadriPsych(25,wA,35,wE,13.8,C,12.5,ql,p);
 assert(result.PRA!==null&&Math.abs(result.PRA-11.5)<.5);assert(result.PRS!==null&&Math.abs(result.PRS-11)<.7);assert(result.mix!==null&&Math.abs(result.mix.temperature.value-27.5)<1e-10);assert(result.supply!==null);assert(Math.abs(result.mix!.dewPoint!-result.PRS!)>3);assert(result.condensate!>0);
});
test('Validaciones de datos físicos e invalidez de mezcla, sin NaN ni recorte de RH',()=>{
 for(const mutate of [(i:any)=>i.quadri.rhSummer.value=101,(i:any)=>i.windows[0].quadriC.value=1.2,(i:any)=>i.internals.people.count.value=-1,(i:any)=>i.quadri.dailyRange='12',(i:any)=>i.internals.equipment.latentFraction.value=.5,(i:any)=>i.geometry.length.value=NaN,(i:any)=>i.quadri.equipmentSensible.value=1000]){const i=quadriReference();mutate(i);assert.throws(()=>calculateQuadri(i));}
 const i=quadriReference();i.quadri!.ventMode='manual';i.outdoorFlow=datum(4000,'m³/h');const r=calculateQuadri(i);assert(r.warnings.some(w=>w.code==='OUTSIDE_EXCEEDS_FLOW'));assert.equal(r.quadri!.peak.psychValid,false);assert.equal(r.quadri!.peak.PRS,null);
});
test('Geometría: reubicar ventana descuenta sólo su muro; orientación cambia radiación y contexto interior',()=>{
 const i=quadriReference(),a=calculateQuadri(i);i.windows[0].parentId='se';i.windows[0].area.value=5;const b=calculateQuadri(i);assert.equal(a.input.surfaces[0].area.value,18.4);assert.equal(b.input.surfaces[0].area.value,36);assert.equal(b.input.surfaces[1].area.value,8.5);assert.equal(b.input.windows[0].azimuth.value,-45);assert.notEqual(a.trace.find(t=>t.id==='vidrio-ne-solar-15')!.result,b.trace.find(t=>t.id==='vidrio-ne-solar-15')!.result);
 i.surfaces[1].quadriBoundary='climatizado';const c=calculateQuadri(i);assert.equal(c.trace.find(t=>t.id==='vidrio-ne-solar-15'),undefined);assert.equal(c.trace.find(t=>t.id==='vidrio-ne-trans-15')!.result,0);
});
test('Edificio: suma simultánea con 13/1 horas, paredes compartidas conservan energía por estación',()=>{
 for(const season of ['verano','invierno'] as const){const a=quadriReference(season),b=structuredClone(a);b.id='otro';b.room='Otra oficina';if(season==='verano')b.climate.indoorTemperature.value=27;else b.quadri!.indoorWinter.value=24;
 const input={schemaVersion:1 as const,projectId:a.projectId,name:'Edificio',rooms:[a,b],partitions:[{id:'medianera',projectId:a.projectId,name:'Compartida',roomAId:a.id,roomBId:b.id,surfaceAId:'interior',surfaceBId:'interior',area:datum(10,'m²'),u:datum(2,'W/(m²·K)'),model:'estacionario' as const}]};const r=calculateBuilding(input),check=r.trace.find(t=>t.id==='partition-medianera-conservation')!;assert.deepEqual(check.result,r.hours.map(()=>0));assert.equal(r.hours.length,season==='verano'?13:1);assert.equal(r.peak.total,Math.max(...r.hours.map(h=>h.total)));assert.equal(r.results[0].trace.find(t=>t.id==='partition-medianera')!.result instanceof Array,true);}
 const i=quadriReference(),b=structuredClone(i);b.id='second';b.quadri!.season='invierno';assert.throws(()=>calculateBuilding({schemaVersion:1,projectId:i.projectId,name:'Mixto',rooms:[i,b]}),/mismo clima/);
});
test('Selección exige fuente y capacidad sensible/caudal; resultados y entradas sobreviven JSON',()=>{
 const i=quadriReference(),q=i.quadri!;q.equipmentTotal.value=15000;let r=calculateQuadri(i);assert.equal(r.quadri!.peak.selection!.checked,false);q.equipmentSensible.value=13000;q.equipmentFlow.value=3600;q.equipmentSource='Ficha en condiciones reales';r=calculateQuadri(i);assert.equal(r.quadri!.peak.selection!.checked,true);assert(r.quadri!.hours.every(h=>h.selection!.total&&h.selection!.sensible&&h.selection!.flow));const restored=calculateQuadri(JSON.parse(JSON.stringify(r.input)));assert.deepEqual(restored.hours.map(h=>h.total),r.hours.map(h=>h.total));
 q.equipmentSensible.value=10000;r=calculateQuadri(i);assert.equal(r.quadri!.peak.selection!.sensible,false);
});
test('Solar: cuatro latitudes del Cuadro 4-III, interpolación explícita Rosario y rechazo fuera del dominio',()=>{
 assert.equal(quadriSolar('NE',10,-35,'35').value,408);assert.equal(quadriSolar('NE',10,-30,'30').value,382);assert.equal(quadriSolar('H',12,-25,'25').value,680);assert.equal(quadriSolar('H',12,-40,'40').value,642);assert(Math.abs(quadriSolar('NE',10,-32.95,'interpolar').value-397.34)<1e-9);assert.throws(()=>quadriSolar('NE',10,32,'interpolar'));assert.throws(()=>quadriSolar('NE',19,-35,'35'));
});
test('C adoptado cierra sensible y latente en la impulsión efectiva y no impone el valor propuesto',()=>{
 const h=hour15(quadriReference());assert(Math.abs(17*h.C!*(25-h.supplyT!)-h.QSi)<1e-8);assert(Math.abs(42*h.C!*(10-h.supplyW!)-h.QLi)<1e-8);
});
