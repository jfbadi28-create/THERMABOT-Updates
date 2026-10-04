/* Patch only template document XML; preserve logo, styles, sections and relationships. */
(function(root){
 'use strict';
 const escape=s=>String(s??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const decode=s=>s.replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&(amp|lt|gt|quot|apos);/g,(_,n)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[n]));
 const paragraphs=/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
 function fill(xml,vars){return xml.replace(paragraphs,p=>{
  const nodes=[...p.matchAll(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g)];let at=0;const values=nodes.map(n=>{const text=decode(n[2]),row={text,start:at,end:at+text.length};at+=text.length;return row;}),text=values.map(n=>n.text).join('');
  const tokens=[...text.matchAll(/\{\{([A-Z_0-9]+)\}\}/g)];for(const token of tokens.reverse()){if(!Object.hasOwn(vars,token[1]))throw Error('Campo de plantilla sin completar: '+token[1]);const start=token.index,end=start+token[0].length,first=values.findIndex(n=>n.end>start);for(let i=first;i<values.length&&values[i].start<end;i++){const n=values[i],a=Math.max(0,start-n.start),b=Math.min(n.end-n.start,end-n.start);n.text=n.text.slice(0,a)+(i===first?String(vars[token[1]]??''):'')+n.text.slice(b);}}
  let index=0;return p.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,(_,open,old,close)=>open+escape(values[index++].text)+close);
 });}
 function documentXml(xml,model){
  const prefixes=['DEC','OBRA','AP','DES','FIN'];let index=0,hasChanges=false;
  const result=xml.replace(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,block=>{
   if(block.startsWith('<w:tbl')){const tableIndex=index++;if(tableIndex===0)return fill(block,model.scalars);const prefix=prefixes[tableIndex-1];if(!prefix)throw Error('Estructura de tablas inesperada.');const row=[...block.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].find(m=>m[0].includes('{{'+prefix+'_'));if(!row)throw Error('No se encontró la fila '+prefix);const keys=[...row[0].matchAll(/\{\{([A-Z_0-9]+)\}\}/g)].map(m=>m[1]),rows=model.tables[prefix],empty=Object.fromEntries(keys.map((k,i)=>[k,i===0?'Sin registros':'—'])),replacement=(rows.length?rows:[empty]).map(r=>fill(row[0],{...model.scalars,...r})).join('');return block.slice(0,row.index)+replacement+block.slice(row.index+row[0].length);}
   if(block.includes('{{CAMBIO_1}}')){hasChanges=true;const notes=model.changes.length?model.changes:['Sin novedades registradas en el período.'];return notes.map(t=>fill(block,{...model.scalars,CAMBIO_1:t})).join('');}
   if(block.includes('{{CAMBIO_2}}')||block.includes('{{CAMBIO_3}}'))return '';
   return fill(block,model.scalars);
  });if(index!==6||!hasChanges)throw Error('La plantilla no tiene las ocho secciones esperadas.');return result;
 }
 async function generate(template,model,Zip=root.JSZip,type='blob'){
  if(!Zip)throw Error('No se pudo cargar el generador de Word.');const zip=await Zip.loadAsync(template);const file=zip.file('word/document.xml');if(!file)throw Error('La plantilla no es un documento Word válido.');zip.file('word/document.xml',documentXml(await file.async('string'),model));return zip.generateAsync({type,compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
 }
 const api={fill,documentXml,generate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBReportDocx=api;
})(typeof globalThis!=='undefined'?globalThis:this);
