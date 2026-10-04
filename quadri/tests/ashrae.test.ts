import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ASHRAE_CATALOG} from '../src/engine/catalogo_ashrae.ts';
import {convolve24,coolingLoad,factorErrors} from '../src/engine/rts.ts';
import {zoneProfile,constructionProfile,factorCoverage} from '../src/engine/bibliotecas_rts.ts';
import {demoInput} from '../src/engine/demo.ts';
import {datum} from '../src/engine/core.ts';
import {internalLoads} from '../src/engine/cargas_internas.ts';
import {calculate} from '../src/engine/index.ts';
const refs=JSON.parse(readFileSync(new URL('./ashrae-references.json',import.meta.url),'utf8'));
// Table 36B uses an en dash as the numeric minus sign.
const num=(s:string)=>Number(s.replace(/^[−–]/,'-'));
const near=(a:number,b:number,t:number)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b} (±${t})`);
test('Biblioteca: 66 muros, 37 cubiertas, 24 zonas y 145 series completas publicadas',()=>{
 assert.equal(ASHRAE_CATALOG.walls.length,66);assert.equal(ASHRAE_CATALOG.roofs.length,37);assert.equal(ASHRAE_CATALOG.zones.length,24);assert.equal(ASHRAE_CATALOG.factors.length,145);
 for(const r of ASHRAE_CATALOG.factors){assert.equal(r.factor.values.length,24);assert.deepEqual(factorErrors(r.factor),[]);assert.match(r.factor.source,/handbook\.ashrae\.org/);}
 assert.equal(ASHRAE_CATALOG.zones.filter(z=>z.solarRts).length,18);
});
test('Redondeo publicado se conserva y se informa; no permite series alteradas ni relaja importaciones',()=>{
 const r=ASHRAE_CATALOG.factors.find(r=>Math.abs(r.sum-1)>.00001)!;
 const result=convolve24(Array(24).fill(100),r.factor);
 near(result.value[0],100*r.sum,1e-8);assert.equal(result.warnings[0].code,'PUBLISHED_FACTOR_ROUNDING');
 const bad=structuredClone(r.factor);bad.values[0]+=.0001;assert.ok(factorErrors(bad).length);
 const unknown=structuredClone(r.factor);unknown.libraryId='inexistente';assert.ok(factorErrors(unknown).length);
 const independent=structuredClone(r.factor);delete independent.libraryId;assert.ok(factorErrors(independent).length);
 const forged=structuredClone(r.factor);forged.construction='Otra construcción';assert.ok(factorErrors(forged).length);
});
test('Referencia ASHRAE tabla 33: iluminación 24 h dentro de la incertidumbre de tabulación',()=>{
 const i=demoInput(),zone=ASHRAE_CATALOG.zones[7],lights=i.internals.lights;
 i.internals.people.count=datum(0,'1');i.internals.equipment.inputPower=datum(0,'W');
 lights.installedPower=datum(110,'W');lights.utilization=datum(1,'1');lights.allowance=datum(1,'1');lights.spaceFraction=datum(1,'1');lights.radiantFraction=datum(.57,'1');
 lights.schedule=Array.from({length:24},()=>datum(0,'1'));for(const row of refs.lighting)lights.schedule[num(row[0])%24]=datum(num(row[3])/100,'1');
 const r=internalLoads(i.internals,{rts:zone.rts},'RTS','error').components.iluminacion.sensible;
 // Table 22 rounds each RTS coefficient to 1 percentage point. Twelve
 // active hourly radiant gains contribute at most 12 * .005 * 62.7 W,
 // plus ±.5 W from the published total. No fitted or normalized factors.
 const roundingBound=12*.005*(110*.57)+.5;
 for(const row of refs.lighting)near(r[num(row[0])%24],num(row[9]),roundingBound);
 near(r[15],103.103,1e-6);
});
test('Referencia independiente ASHRAE tabla 36B: CTS y RTS del muro, 24 h ±1 W',()=>{
 const gains=Array(24).fill(0);for(const row of refs.wall)gains[num(row[0])%24]=num(row[5]);
 const cts=convolve24(gains,ASHRAE_CATALOG.walls[1].cts).value;
 const load=coolingLoad(cts,.46,ASHRAE_CATALOG.zones[7].rts,'RTS','error','published-wall').value.load;
 for(const row of refs.wall){const h=num(row[0])%24;near(cts[h],num(row[6]),1);near(load[h],num(row[11]),1);}
 near(load[15],34,.7);
});
test('Selección explícita conserva geometría/clima y asigna U + CTS solo al cerramiento elegido',()=>{
 const original=demoInput(),before=structuredClone(original),id=original.surfaces[0].id;
 let selected=zoneProfile(original,ASHRAE_CATALOG.zones[7].id);
 selected=constructionProfile(selected,id,ASHRAE_CATALOG.walls[1].id);
 assert.deepEqual(original,before);assert.deepEqual(selected.climate,before.climate);assert.deepEqual(selected.geometry,before.geometry);
 assert.equal(selected.surfaces[0].u.value,.244);assert.equal(selected.surfaces[1].u.value,before.surfaces[1].u.value);
 assert.ok(selected.surfaces[0].factors?.cts?.libraryId);assert.equal(selected.surfaces[1].factors?.cts,undefined);
 assert.throws(()=>constructionProfile(selected,id,ASHRAE_CATALOG.roofs[0].id));
 assert.throws(()=>zoneProfile(original,ASHRAE_CATALOG.zones[18].id));
});
test('Cadena RTS completa con biblioteca oficial y sin selección automática de datos faltantes',()=>{
 let i=zoneProfile(demoInput(),ASHRAE_CATALOG.zones[7].id);
 for(const s of i.surfaces)i=constructionProfile(i,s.id,s.tilt.value===0?ASHRAE_CATALOG.roofs[31].id:ASHRAE_CATALOG.walls[1].id);
 assert.equal(factorCoverage(i).missing.length,0);i.fallback='error';const r=calculate(i);assert.equal(r.mode,'RTS');assert.ok(!r.warnings.some(w=>w.code==='INVALID_FACTORS'));
 assert.ok(r.trace.some(t=>Object.values(t.variables).some(v=>v.source.includes('handbook.ashrae.org'))));
 assert.equal(calculate(demoInput()).mode,'instantaneo');
 const restored=JSON.parse(JSON.stringify(i));assert.equal(calculate(restored).peak.total,r.peak.total);
 restored.surfaces[0].u.value=1.2;assert.throws(()=>calculate(restored),/U modificada/);
 restored.fallback='instantaneo';assert.equal(calculate(restored).mode,'instantaneo');
});
