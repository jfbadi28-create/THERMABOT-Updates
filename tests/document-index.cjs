const test=require('node:test'),assert=require('node:assert/strict'),C=require('../document-index-core.js');
const header=['Categoría','Establecimiento','Código de obra','','','','','','','','','ID de Drive'];
const workHeader=['','','Código de obra / proyecto'];
const row=(id,code,title)=>{const r=[];r[2]=code;r[5]=title;r[11]=id;r[12]='https://drive.google.com/file/d/'+id+'/view';r[15]='PLIEGO';r[16]='R04';r[17]='APROBACIÓN NO VERIFICADA';return r;};
const index=C.parseIndex([header,row('doc1','H-TMO','Pliego TMO'),row('doc2','H-UTI','Pliego UTI')],[workHeader,['','Hospital','H-TMO','TMO','','','','','https://drive.google.com/drive/folders/folder1'],['','Hospital','H-UTI','UTI','','','','','https://drive.google.com/drive/folders/folder2']]);
test('Asocia por ID de carpeta o documento sin confundir proyectos por nombres similares',()=>{
  assert.equal(C.resolveWork({sourceDriveUrl:'https://drive.google.com/drive/folders/folder1'},index).code,'H-TMO');
  assert.equal(C.resolveWork({sourceDriveUrl:'https://docs.google.com/document/d/doc2/edit'},index).code,'H-UTI');
  assert.equal(C.resolveWork({name:'TMO',sourceDriveUrl:'https://example.com/folder1'},index),null);
  assert.equal(C.resolveWork({driveProjectCode:'NO-EXISTE',sourceDriveUrl:'https://drive.google.com/drive/folders/folder1'},index),null);
  assert.equal(C.resolveWork({driveProjectCode:'H-UTI'},index).code,'H-UTI');
});
test('Preserva aprobación pendiente, rechaza duplicados y enlaces externos',()=>{
  assert.equal(index.documents[0].state,'APROBACIÓN NO VERIFICADA');
  assert.equal(C.forWork(index,'H-TMO','tmo')[0].id,'doc1');
  assert.deepEqual(C.forWork(index,'H-TMO','','PLANO'),[]);
  assert.throws(()=>C.parseIndex([header,row('same','A','Uno'),row('same','B','Otro')],[workHeader]),/repetidos/);
  assert.equal(C.driveUrl('javascript:alert(1)'), '');assert.equal(C.driveUrl('https://example.com/manual.pdf'),'');
  assert.throws(()=>C.parseIndex([['Datos']], [workHeader]),/columnas/);
});
