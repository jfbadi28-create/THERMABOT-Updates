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
test('Inventario automático superpone metadata por ID y conserva clasificación humana',async()=>{const meta={sheets:[{properties:{title:'F1 - INVENTARIO TOTAL',gridProperties:{rowCount:100}}},{properties:{title:'CONTROL ESTRUCTURAL',gridProperties:{rowCount:100}}},{properties:{title:'AUTO - INVENTARIO DRIVE',gridProperties:{rowCount:6001}}}]};const header=['Categoría','Establecimiento','Código de obra','','','','','','','','','ID de Drive'],row=['Obra','Ensayo','OLD','04','vieja','Viejo.pdf','','','','','','doc','https://drive.google.com/file/d/doc/view','','','Pliego','R1','APROBACIÓN NO VERIFICADA'];const google=async(e,u)=>{if(u.includes('?fields='))return new Response(JSON.stringify(meta));const decoded=decodeURIComponent(u);return new Response(JSON.stringify({values:decoded.includes('F1 - INVENTARIO')?[header,row]:decoded.includes('CONTROL')?[['','','Código de obra / proyecto']]:[['ID','','','','','','','','Versión Drive'],['doc','NEW','04','nueva','Nuevo R3.pdf','application/pdf','2026-10-12','https://drive.google.com/file/d/doc/view','3','available','2026-10-12']]}));};const result=await readIndex({THERMABOT_DOCUMENT_INDEX_SHEET_ID:'sheet'},google);assert.equal(result.documents.length,1);assert.equal(result.documents[0].title,'Nuevo R3.pdf');assert.equal(result.documents[0].type,'Pliego');assert.equal(result.documents[0].revision,'R3');assert.equal(result.documents[0].code,'NEW');assert.equal(result.documents[0].state,'APROBACIÓN NO VERIFICADA');});
