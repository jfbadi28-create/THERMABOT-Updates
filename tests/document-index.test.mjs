import test from 'node:test';
import assert from 'node:assert/strict';
import {onRequest,readIndex} from '../functions/api/document-index.js';
test('Índice no configurado no aparenta conexión y no permite escrituras',async()=>{
  const r=await onRequest({request:new Request('https://example.com/api/document-index'),env:{}});assert.equal(r.status,503);assert.equal((await r.json()).code,'INDEX_NOT_CONFIGURED');
  const put=await onRequest({request:new Request('https://example.com/api/document-index',{method:'PUT'}),env:{}});assert.equal(put.status,405);
});
test('Consulta sólo las pestañas configuradas y sus límites reales; conserva la fuente privada',async()=>{
  const calls=[];
  const google=async(_env,url)=>{calls.push(url);
    if(url.includes('?fields='))return new Response(JSON.stringify({sheets:[{properties:{title:'F1 - INVENTARIO TOTAL',gridProperties:{rowCount:6000}}},{properties:{title:'CONTROL ESTRUCTURAL',gridProperties:{rowCount:100}}}]}));
    if(decodeURIComponent(url).includes('F1 - INVENTARIO TOTAL'))return new Response(JSON.stringify({values:[['Categoría','Establecimiento','Código de obra','','','','','','','','','ID de Drive']]}));
    return new Response(JSON.stringify({values:[['','','Código de obra / proyecto']]}));
  };
  const data=await readIndex({THERMABOT_DOCUMENT_INDEX_SHEET_ID:'test_sheet'},google);
  assert.equal(calls.length,3);assert(calls.some(u=>decodeURIComponent(u).includes('A1:V6000')));assert(calls.some(u=>decodeURIComponent(u).includes('A1:I100')));
  assert.equal(data.sourceUrl,'https://docs.google.com/spreadsheets/d/test_sheet/edit');assert.deepEqual(data.documents,[]);
});
test('No permite inyectar una URL de Google ni silencia un índice truncado',async()=>{
  await assert.rejects(()=>readIndex({THERMABOT_DOCUMENT_INDEX_SHEET_ID:'../../private'},()=>{throw Error('No debe consultar');}),/INDEX_NOT_CONFIGURED/);
  const google=async(_env,url)=>url.includes('?fields=')?new Response(JSON.stringify({sheets:[{properties:{title:'F1 - INVENTARIO TOTAL',gridProperties:{rowCount:7000}}},{properties:{title:'CONTROL ESTRUCTURAL',gridProperties:{rowCount:100}}}]})):new Response(JSON.stringify({values:decodeURIComponent(url).includes('INVENTARIO')?Array(6001).fill(['x']):[]}));
  await assert.rejects(()=>readIndex({THERMABOT_DOCUMENT_INDEX_SHEET_ID:'test'},google),/INDEX_TOO_LARGE/);
});
