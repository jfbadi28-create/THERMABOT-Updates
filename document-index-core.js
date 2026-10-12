/* Read-only document index. Project linkage uses stable Drive IDs, never fuzzy names. */
(function(root){
  'use strict';
  const clean=value=>String(value??'').trim();
  function driveId(value){
    try{const u=new URL(value);if(u.protocol!=='https:'||!['drive.google.com','docs.google.com'].includes(u.hostname))return '';
      return u.pathname.match(/\/(?:folders|d)\/([\w-]+)/)?.[1]||u.searchParams.get('id')||'';
    }catch{return '';}
  }
  function driveUrl(value){return driveId(value)?String(value):'';}
  function parseIndex(fileRows,workRows){
    const expected=['Categoría','Establecimiento','Código de obra'];
    if(!Array.isArray(fileRows)||!expected.every((v,i)=>clean(fileRows[0]?.[i])===v)||clean(fileRows[0]?.[11])!=='ID de Drive')throw Error('El inventario no tiene las columnas esperadas.');
    if(!Array.isArray(workRows)||clean(workRows[0]?.[2])!=='Código de obra / proyecto')throw Error('El control de obras no tiene las columnas esperadas.');
    const works=workRows.slice(1).filter(r=>clean(r[2])&&driveId(r[8])).map(r=>({code:clean(r[2]),title:clean(r[3]),establishment:clean(r[1]),folderId:driveId(r[8]),driveUrl:driveUrl(r[8])}));
    const seen=new Set(),documents=[];
    for(const r of fileRows.slice(1)){
      const id=clean(r[11]);if(!/^[\w-]+$/.test(id))continue;if(seen.has(id))throw Error('El inventario contiene IDs de archivo repetidos.');seen.add(id);
      documents.push({id,code:clean(r[2]),section:clean(r[3]),path:clean(r[4]),title:clean(r[5]),format:clean(r[6]),
        modifiedAt:clean(r[10]),driveUrl:driveUrl(r[12]),type:clean(r[15]),revision:clean(r[16]),
        state:clean(r[17])||'APROBACIÓN NO VERIFICADA',group:clean(r[18]),action:clean(r[21])});
    }
    return {works,documents};
  }
  function resolveWork(project,index){
    if(project.driveProjectCode){const exact=index.works.find(w=>w.code===project.driveProjectCode);return exact||null;}
    const id=driveId(project.driveFolderUrl||project.sourceDriveUrl);if(!id)return null;
    const folder=index.works.filter(w=>w.folderId===id);if(folder.length===1)return folder[0];
    const codes=[...new Set(index.documents.filter(d=>d.id===id).map(d=>d.code))];
    return codes.length===1?index.works.find(w=>w.code===codes[0])||null:null;
  }
  function forWork(index,code,query='',kind=''){
    const q=clean(query).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return index.documents.filter(d=>d.code===code&&(!kind||d.type===kind)&&(!q||[d.title,d.path,d.revision,d.state].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)))
      .sort((a,b)=>a.section.localeCompare(b.section)||a.title.localeCompare(b.title,'es'));
  }
  const api={driveId,driveUrl,parseIndex,resolveWork,forWork};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TBDocumentIndexCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
