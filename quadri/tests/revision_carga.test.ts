import test from 'node:test';
import assert from 'node:assert/strict';
import {quadriReference} from '../src/engine/casos_quadri.ts';
import {reviewSignature,roomReview,REVIEW_SECTIONS} from '../src/engine/revision_carga.ts';
import type {RoomReview} from '../src/engine/revision_carga.ts';
import {calculateQuadri} from '../src/engine/quadri.ts';
const confirm=(i:ReturnType<typeof quadriReference>)=>Object.fromEntries(REVIEW_SECTIONS.map(s=>[s.id,reviewSignature(i,s.id)])) as RoomReview;
test('Las entradas nunca se consideran revisadas solo por tener valores o ceros',()=>{
 const i=quadriReference();assert(roomReview(i).every(s=>!s.reviewed));i.internals.people.count.value=0;assert(roomReview(i,confirm(i)).every(s=>s.reviewed));
});
test('Editar una carga invalida solamente su revisión; cambiar estación conserva las revisiones',()=>{
 const i=quadriReference(),review=confirm(i);i.quadri!.season='invierno';assert(roomReview(i,review).every(s=>s.reviewed));
 i.internals.people.count.value++;assert.deepEqual(roomReview(i,review).filter(s=>!s.reviewed).map(s=>s.id),['internas']);
});
test('Un cambio climático de invierno requiere revisión aunque se esté calculando verano',()=>{
 const i=quadriReference(),review=confirm(i);i.quadri!.outdoorWinter.value--;assert.deepEqual(roomReview(i,review).filter(s=>!s.reviewed).map(s=>s.id),['clima']);
});
test('El recálculo conserva revisión y resultados; un cambio de protección solar invalida envolvente',()=>{
 const i=quadriReference(),review=confirm(i),r=calculateQuadri(i);assert(roomReview(r.input,review).every(s=>s.reviewed));assert.equal(r.quadri!.hours.find(h=>h.hour===15)!.QT,14308);
 i.windows[0].quadriC!.value=.5;assert.deepEqual(roomReview(i,review).filter(s=>!s.reviewed).map(s=>s.id),['envolvente']);
});
test('La revisión viaja por JSON y detecta una pared compartida modificada',()=>{
 const i=quadriReference(),links=[{area:10}],review={envolvente:reviewSignature(i,'envolvente',links)};
 const restored=JSON.parse(JSON.stringify({i,review,links}));assert(roomReview(restored.i,restored.review,restored.links).find(s=>s.id==='envolvente')!.reviewed);
 restored.links[0].area=11;assert(!roomReview(restored.i,restored.review,restored.links).find(s=>s.id==='envolvente')!.reviewed);
});
