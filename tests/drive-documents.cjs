const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(fetch){
  let selected='p1',mutations=0;
  const controls=new Map(),host={innerHTML:'',querySelectorAll(){return [];},querySelector(selector){if(!controls.has(selector))controls.set(selector,{value:'',focus(){},setSelectionRange(){}});return controls.get(selector);}};
  const context={window:{},URL,Response,AbortSignal,Date,fetch,document:{getElementById:id=>id==='driveDocumentIndex'?host:null}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('document-index-core.js','utf8'),context);vm.runInContext(fs.readFileSync('drive-documents.js','utf8'),context);
  const projects=[{id:'p1',sourceDriveUrl:'https://drive.google.com/drive/folders/f1'},{id:'p2',sourceDriveUrl:'https://drive.google.com/drive/folders/f2'}];
  const api=context.window.TBDriveDocuments({API:{selectedId:()=>selected,mutate(){mutations++;}},tracker:()=>({projects}),esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast(){},onLinked(){}});
  return {api,host,select:id=>selected=id,mutations:()=>mutations};
}
const index={checkedAt:'2026-10-12T12:00:00Z',sourceUrl:'https://docs.google.com/spreadsheets/d/test/edit',works:[{code:'ONE',title:'Primera',folderId:'f1',driveUrl:'https://drive.google.com/drive/folders/f1'},{code:'TWO',title:'Segunda',folderId:'f2',driveUrl:'https://drive.google.com/drive/folders/f2'}],documents:[{id:'d1',code:'ONE',title:'Sólo primera',section:'04',path:'Pliegos',type:'PLIEGO',revision:'R01',state:'APROBACIÓN NO VERIFICADA',driveUrl:'https://drive.google.com/file/d/d1/view'},{id:'d2',code:'TWO',title:'<img onerror="bad">',section:'03',path:'Planos',type:'PLANO',state:'APROBACIÓN NO VERIFICADA',driveUrl:'https://drive.google.com/file/d/d2/view'}]};
test('Cambiar de proyecto durante la consulta no pinta documentos ajenos ni modifica la cartera',async()=>{
  let resolve;const h=setup(()=>new Promise(r=>resolve=r));
  const first=h.api.mount('p1');h.select('p2');const second=h.api.mount('p2');
  resolve(new Response(JSON.stringify(index),{headers:{'Content-Type':'application/json'}}));await Promise.all([first,second]);
  assert(!h.host.innerHTML.includes('Sólo primera'));assert(h.host.innerHTML.includes('&lt;img'));assert(!h.host.innerHTML.includes('<img onerror'));
  assert.equal(h.mutations(),0);
});
test('Un índice desconectado muestra el error sin aparentar una consulta exitosa',async()=>{
  const h=setup(async()=>new Response(JSON.stringify({error:'Índice no conectado'}),{status:503,headers:{'Content-Type':'application/json'}}));
  await h.api.mount('p1');assert(h.host.innerHTML.includes('Índice no conectado'));assert(h.host.innerHTML.includes('documentos registrados arriba siguen disponibles'));assert.equal(h.mutations(),0);
});
