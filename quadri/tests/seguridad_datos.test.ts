import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImportedData,escapeHtml} from '../src/engine/seguridad_datos.ts';
import {quadriReference} from '../src/engine/casos_quadri.ts';
test('Importación rechaza claves de alteración de prototipo en cualquier profundidad',()=>{
 for(const key of ['__proto__','constructor','prototype'])assert.throws(()=>validateImportedData(JSON.parse('{"rooms":[{"'+key+'":{"polluted":true}}]}')),/no permitida/);
 assert.equal(({} as any).polluted,undefined);
});
test('Importación limita profundidad y nodos, conserva un proyecto Quadri legítimo',()=>{
 let deep:any={};for(let n=0;n<42;n++)deep={child:deep};assert.throws(()=>validateImportedData(deep),/complejo/);
 assert.throws(()=>validateImportedData(Array(150001).fill(0)),/complejo/);validateImportedData(quadriReference());
});
test('Nombres e identificadores importados se escapan para texto y atributos HTML',()=>{
 assert.equal(escapeHtml('\"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
 assert.equal(escapeHtml("O'Connor & asociados"),'O&#39;Connor &amp; asociados');
});
