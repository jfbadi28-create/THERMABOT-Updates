/* The Drive inventory stays read-only. Only an explicit folder association edits a project. */
window.TBDriveDocuments=function(options){
  'use strict';
  const {API,tracker,esc,toast,onLinked,onDocument}=options;
  const core=TBDocumentIndexCore;
  let index=null,error='',loading=null,source=null,generation=0;
  const views=new Map();
  const project=id=>tracker().projects.find(p=>p.id===id);
  const html=()=>'<section id="driveDocumentIndex" class="card drive-document-index" aria-label="Archivos del expediente en Drive"><p role="status">Consultando índice de Drive…</p></section>';
  function paint(id,token){
    const host=document.getElementById('driveDocumentIndex');if(!host||token!==generation||API.selectedId()!==id)return;
    const p=project(id);if(!p)return;
    if(!index){
      host.innerHTML='<div class="suite-head"><div><h3>Archivos de Drive</h3><p role="status">'+esc(error||'Consultando índice de Drive…')+'</p></div><button id="retryDocumentIndex" '+(loading?'disabled':'')+'>Reintentar</button></div><p class="subtle">Los documentos registrados arriba siguen disponibles. El índice se consulta sin modificar tus archivos.</p>';
      host.querySelector('#retryDocumentIndex').onclick=()=>mount(id,true);return;
    }
    const view=views.get(id)||{query:'',type:''};views.set(id,view);
    const work=core.resolveWork(p,index),list=work?core.forWork(index,work.code,view.query,view.type):[];
    const types=work?[...new Set(core.forWork(index,work.code).map(d=>d.type).filter(Boolean))].sort():[];
    const option=(value,label,current)=>'<option value="'+esc(value)+'" '+(value===current?'selected':'')+'>'+esc(label)+'</option>';
    host.innerHTML='<div class="suite-head"><div><h3>Expediente en Drive</h3><p>Archivos del inventario · '+esc(work?.code||'carpeta por asociar')+'</p></div><div class="actions"><a class="pill" href="'+esc(source.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Registro maestro</a><button id="refreshDocumentIndex">Actualizar índice</button></div></div>'+
      '<div class="suite-toolbar"><label class="grow">Carpeta de la obra<select id="documentIndexWork"><option value="">Sin asociación</option>'+index.works.map(w=>option(w.code,w.code+' · '+w.title,work?.code)).join('')+'</select></label><button id="linkDocumentIndexWork">Guardar asociación</button></div>'+
      '<p class="subtle">La asociación automática se basa en el ID de Drive. Elegí una carpeta si la referencia antigua apunta a otro documento. Guardar la asociación no cambia la etapa ni el estado del proyecto.</p>'+
      (work?'<div class="actions"><a class="pill" href="'+esc(work.driveUrl)+'" target="_blank" rel="noopener noreferrer">Abrir carpeta de la obra</a></div><div class="suite-toolbar"><label class="grow">Buscar documento<input id="documentIndexQuery" value="'+esc(view.query)+'" placeholder="Pliego, plano, cálculo, revisión…"></label><label>Tipo<select id="documentIndexType"><option value="">Todos</option>'+types.map(t=>option(t,t,view.type)).join('')+'</select></label></div><p>La revisión visible y el inventario no acreditan aprobación. Verificá el estado antes de usar un archivo.</p><div class="technical-table"><table><thead><tr><th>Documento</th><th>Tipo / revisión</th><th>Estado y pendiente</th><th></th></tr></thead><tbody>'+list.map(d=>'<tr><td><strong>'+esc(d.title)+'</strong><small>'+esc(d.path)+'</small></td><td>'+esc(d.type||d.format)+'<small>'+esc(d.revision||'Sin revisión identificada')+'</small></td><td>'+esc(d.state)+(d.driveStatus&&d.driveStatus!=='available'?'<small class="due-risk">'+(d.driveStatus==='not-in-scope'?'Fuera del alcance automático; registro conservado':'No localizado en el último recorrido; verificar acceso y ubicación')+'</small>':'')+'<small>'+esc(d.action)+'</small></td><td>'+(d.driveUrl?'<a href="'+esc(d.driveUrl)+'" target="_blank" rel="noopener noreferrer">Abrir en Drive</a>':'Enlace por verificar')+(d.driveUrl?'<button data-link-index-doc="'+esc(d.id)+'">Vincular al proyecto</button>':'')+'</td></tr>').join('')+'</tbody></table></div><p class="subtle">'+list.length+' archivos en esta selección. Consulta del índice: '+esc(new Date(source.checkedAt).toLocaleString('es-AR'))+'.</p>':'<p>Seleccioná la carpeta correspondiente para consultar los archivos. No se atribuyen documentos por parecido de nombres.</p>');
    host.querySelectorAll('[data-link-index-doc]').forEach(b=>b.onclick=()=>onDocument?.(index.documents.find(d=>d.id===b.dataset.linkIndexDoc),id));
    host.querySelector('#refreshDocumentIndex').onclick=()=>mount(id,true);
    host.querySelector('#linkDocumentIndexWork').onclick=()=>{
      const code=host.querySelector('#documentIndexWork').value,next=index.works.find(w=>w.code===code);
      if(code&&!next)return;if((p.driveProjectCode||'')===code){toast('La asociación ya está guardada.');return;}
      const expected=p.updatedAt||'';
      try{API.mutate(data=>{const current=data.projects.find(x=>x.id===id);if(!current||(current.updatedAt||'')!==expected)throw Error('El proyecto cambió. Volvé a abrir su ficha antes de asociarlo.');
        const before=current.driveProjectCode||'',at=new Date().toISOString();current.driveProjectCode=code;current.updatedAt=at;
        current.followUpLog=[...(current.followUpLog||[]),{id:crypto.randomUUID(),at,actor:'Operador',note:'Asociación del expediente de Drive actualizada',changes:[{field:'driveProjectCode',label:'Código de obra en Drive',before,after:code}]}];});
        toast('Asociación guardada localmente; comprobá la confirmación de Drive.');onLinked();
      }catch(e){toast(e.message);}
    };
    const query=host.querySelector('#documentIndexQuery');if(query)query.oninput=e=>{view.query=e.target.value;const pos=e.target.selectionStart;paint(id,token);const input=document.getElementById('documentIndexQuery');input.focus();input.setSelectionRange(pos,pos);};
    const type=host.querySelector('#documentIndexType');if(type)type.onchange=e=>{view.type=e.target.value;paint(id,token);};
  }
  async function mount(id,refresh=false){
    const token=++generation;
    if(refresh){index=null;error='';}
    if(!index&&!loading){
      loading=(async()=>{try{
        const response=await fetch('api/document-index',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(20000)});
        if(!response.headers.get('Content-Type')?.includes('application/json'))throw Error(response.status===401?'Iniciá sesión en THERMABOT para consultar Drive.':'No se pudo consultar el índice de Drive.');
        const data=await response.json();if(!response.ok)throw Error(data.error||'No se pudo consultar el índice.');
        if(!Array.isArray(data.works)||!Array.isArray(data.documents))throw Error('El índice recibido no tiene el formato esperado.');
        index={works:data.works,documents:data.documents};source=data;error='';
      }catch(e){error=e.name==='TimeoutError'?'La consulta de Drive demoró demasiado. Reintentá.':e.message;}
      finally{loading=null;}})();
    }
    paint(id,token);if(loading)await loading;paint(id,token);
  }
  async function search(query){if(!index){await mount(API.selectedId());}if(!index){throw Error(error||'Índice no disponible.');}const q=String(query||'').trim().toLocaleLowerCase('es');return index.documents.filter(d=>[d.title,d.path,d.type,d.revision].join(' ').toLocaleLowerCase('es').includes(q)).slice(0,60).map(d=>({...d,kind:'Drive',detail:[d.path,d.revision].filter(Boolean).join(' · ')}));}
  function folder(id){const p=project(id);if(!p)return '';const direct=window.TBProjectDriveCore?.folder(p);return direct|| (index?core.resolveWork(p,index)?.driveUrl||'':'');}
  async function specifications(id){if(!index)await mount(id);if(!index)throw Error(error||'Índice no disponible.');const p=project(id),work=p&&core.resolveWork(p,index);return work?core.forWork(index,work.code).filter(d=>/pliego/i.test(d.type)||/pliego/i.test(d.title)):[];}
  return {html,mount,search,folder,specifications};
};
