(function(){
  'use strict';

  const STORAGE_KEY='thermabot.proyectos.v1';
  const $=id=>document.getElementById(id);
  const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const fmt=(v,d=1)=>Number(v??0).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
  const uid=p=>`${p}-${Math.random().toString(36).slice(2,9)}`;

  let projects=[];
  let currentProject=null;
  let network=null;
  let lastDesign=null;

  function readProjects(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');}catch(e){return [];}
  }
  function writeProjects(){
    const latest=readProjects();
    const saved=latest.find(p=>p.id===currentProject?.id);
    if(saved){saved.pressureNetwork=JSON.parse(JSON.stringify(network));localStorage.setItem(STORAGE_KEY,JSON.stringify(latest));}
    if(parent!==window&&saved)parent.postMessage({type:'thermabot:saved',balanceId:saved.id,explicit:false},location.origin);
  }
  function saveNetwork(){
    if(!currentProject||!network)return;
    currentProject.pressureNetwork=JSON.parse(JSON.stringify(network));
    writeProjects();
  }

  function calcAmbientResult(a,p){
    try{
      if(window.THERMABOT_ENGINE?.calcular_ambiente){
        return THERMABOT_ENGINE.calcular_ambiente(a,p.condiciones||{},p.cerramientos||[]);
      }
    }catch(e){console.warn('No se pudo recalcular ambiente',a?.nombre,e);}
    return null;
  }

  function nodeFromAmbient(a,p){
    const r=calcAmbientResult(a,p);
    const volume=r?.volumen_m3 ?? (n(a.largo)*n(a.ancho)*n(a.altura,2.8));
    const supply=n(a.pressureSupplyM3h,r?.caudal_impulsion_m3h||0);
    const outdoor=n(a.pressureOutdoorM3h,r?.caudal_aire_exterior_m3h||0);
    return {
      id:a.id,
      name:a.nombre||'Ambiente',
      volumeM3:volume,
      supplyM3h:supply,
      returnM3h:n(a.pressureReturnM3h,supply),
      exhaustM3h:n(a.pressureExhaustM3h,0),
      outdoorM3h:outdoor,
      targetPa:n(a.pressureTargetPa,0),
      temperatureC:n(p.condiciones?.tempInterior,24),
      rhPct:n(p.condiciones?.humedadInterior,50),
      elevationM:n(a.pressureElevationM,0)
    };
  }

  function buildDefaultNetwork(p){
    const nodes=(p.ambientes||[]).map(a=>nodeFromAmbient(a,p));
    const preferred=(nodes.find(x=>/pasillo|circul|corredor/i.test(x.name))||nodes[nodes.length-1]||nodes[0]);
    return {
      version:1,
      referenceNodeId:preferred?.id||null,
      referencePressurePa:0,
      nodes,
      connections:[]
    };
  }

  function mergeWithProject(net,p){
    const byId=new Map((net?.nodes||[]).map(x=>[x.id,x]));
    const nodes=(p.ambientes||[]).map(a=>({...nodeFromAmbient(a,p),...(byId.get(a.id)||{}),id:a.id,name:a.nombre||byId.get(a.id)?.name||'Ambiente'}));
    for(const old of (net?.nodes||[])) if(!nodes.some(x=>x.id===old.id) && old.manual) nodes.push(old);
    const valid=new Set(nodes.map(x=>x.id));
    const connections=(net?.connections||[]).filter(c=>valid.has(c.from)&&valid.has(c.to));
    let referenceNodeId=net?.referenceNodeId;
    if(!valid.has(referenceNodeId)) referenceNodeId=(nodes.find(x=>/pasillo|circul|corredor/i.test(x.name))||nodes[nodes.length-1])?.id||null;
    return {version:1,referenceNodeId,referencePressurePa:n(net?.referencePressurePa,0),nodes,connections};
  }

  function loadSelectedProject(){
    const id=$('projectSelect').value;
    currentProject=projects.find(p=>p.id===id)||projects[0]||null;
    if(!currentProject){
      network={version:1,referenceNodeId:null,referencePressurePa:0,nodes:[],connections:[]};
    }else{
      network=mergeWithProject(currentProject.pressureNetwork||buildDefaultNetwork(currentProject),currentProject);
    }
    lastDesign=null;
    $('applyDesignBtn').classList.add('hidden');
    renderAll();
  }

  function renderProjects(){
    $('projectSelect').innerHTML=projects.length
      ? projects.map(p=>`<option value="${p.id}" ${currentProject?.id===p.id?'selected':''}>${escapeHtml(p.nombre||'Proyecto')}</option>`).join('')
      : '<option value="">Sin proyectos guardados</option>';
  }

  function nodeOptions(selected){
    return (network.nodes||[]).map(x=>`<option value="${x.id}" ${x.id===selected?'selected':''}>${escapeHtml(x.name)}</option>`).join('');
  }

  function renderNodes(){
    $('nodesBody').innerHTML=(network.nodes||[]).map((x,i)=>`
      <tr>
        <td><input data-node="${i}" data-f="name" value="${escapeAttr(x.name)}"></td>
        <td><input data-node="${i}" data-f="volumeM3" type="number" step="0.1" value="${n(x.volumeM3)}"></td>
        <td><input data-node="${i}" data-f="supplyM3h" type="number" step="1" value="${n(x.supplyM3h)}"></td>
        <td><input data-node="${i}" data-f="returnM3h" type="number" step="1" value="${n(x.returnM3h)}"></td>
        <td><input data-node="${i}" data-f="exhaustM3h" type="number" step="1" value="${n(x.exhaustM3h)}"></td>
        <td><input data-node="${i}" data-f="outdoorM3h" type="number" step="1" value="${n(x.outdoorM3h)}"></td>
        <td><input data-node="${i}" data-f="targetPa" type="number" step="0.1" value="${n(x.targetPa)}"></td>
        <td><input data-node="${i}" data-f="temperatureC" type="number" step="0.1" value="${n(x.temperatureC,24)}"></td>
        <td><input data-node="${i}" data-f="rhPct" type="number" min="0" max="100" step="1" value="${n(x.rhPct,50)}"></td>
        <td>${x.manual?`<button class="icon-btn" data-del-node="${i}" title="Eliminar">×</button>`:''}</td>
      </tr>`).join('') || '<tr><td colspan="10" class="empty">No hay ambientes.</td></tr>';

    document.querySelectorAll('[data-node]').forEach(el=>{
      el.onchange=()=>{
        const i=+el.dataset.node,f=el.dataset.f;
        network.nodes[i][f]=f==='name'?el.value:n(el.value);
        renderReference();renderConnections();saveNetwork();
      };
    });
    document.querySelectorAll('[data-del-node]').forEach(el=>el.onclick=()=>{
      const i=+el.dataset.delNode,id=network.nodes[i].id;
      network.nodes.splice(i,1);
      network.connections=network.connections.filter(c=>c.from!==id&&c.to!==id);
      if(network.referenceNodeId===id) network.referenceNodeId=network.nodes[0]?.id||null;
      saveNetwork();renderAll();
    });
  }

  function renderReference(){
    $('referenceNode').innerHTML=nodeOptions(network.referenceNodeId);
    $('referenceNode').value=network.referenceNodeId||'';
    $('referencePressure').value=n(network.referencePressurePa,0);
  }

  function renderConnections(){
    $('connections').innerHTML=(network.connections||[]).map((c,i)=>`
      <div class="connection card-soft">
        <div class="connection-head">
          <input class="conn-name" data-conn="${i}" data-f="name" value="${escapeAttr(c.name||`Conexión ${i+1}`)}">
          <button class="icon-btn" data-del-conn="${i}">×</button>
        </div>
        <div class="connection-grid">
          <label>Desde<select data-conn="${i}" data-f="from">${nodeOptions(c.from)}</select></label>
          <label>Hacia<select data-conn="${i}" data-f="to">${nodeOptions(c.to)}</select></label>
          <label>Modelo<select data-conn="${i}" data-f="model"><option value="powerLaw" ${c.model==='powerLaw'?'selected':''}>Power law</option><option value="orifice" ${c.model==='orifice'?'selected':''}>Orificio</option></select></label>
          <label>Dirección esperada<select data-conn="${i}" data-f="preferredDirection"><option value="either" ${c.preferredDirection==='either'?'selected':''}>Cualquiera</option><option value="from_to" ${c.preferredDirection==='from_to'?'selected':''}>Desde → Hacia</option><option value="to_from" ${c.preferredDirection==='to_from'?'selected':''}>Hacia → Desde</option></select></label>
          <label>C [m³/h·Pa⁻ⁿ]<input data-conn="${i}" data-f="C" type="number" step="0.1" min="0" value="${n(c.C,25)}"></label>
          <label>n<input data-conn="${i}" data-f="n" type="number" step="0.01" min="0.5" max="1" value="${n(c.n,0.65)}"></label>
          <label>Área efectiva [m²]<input data-conn="${i}" data-f="areaM2" type="number" step="0.001" min="0" value="${n(c.areaM2,0.01)}"></label>
          <label>Cd<input data-conn="${i}" data-f="Cd" type="number" step="0.01" min="0.05" max="1.2" value="${n(c.Cd,0.65)}"></label>
          <label>Altura efecto stack [m]<input data-conn="${i}" data-f="heightM" type="number" step="0.1" value="${n(c.heightM,0)}"></label>
          <label>Presión viento [Pa]<input data-conn="${i}" data-f="windPa" type="number" step="0.1" value="${n(c.windPa,0)}"></label>
          <label>Calidad del dato<select data-conn="${i}" data-f="quality"><option value="estimated" ${c.quality==='estimated'?'selected':''}>Estimado</option><option value="manufacturer" ${c.quality==='manufacturer'?'selected':''}>Fabricante</option><option value="measured" ${c.quality==='measured'?'selected':''}>Medido</option></select></label>
        </div>
      </div>`).join('') || '<div class="empty">Todavía no hay conexiones. Agregá una puerta, fuga o rejilla de transferencia.</div>';

    document.querySelectorAll('[data-conn]').forEach(el=>el.onchange=()=>{
      const i=+el.dataset.conn,f=el.dataset.f;
      const numeric=['C','n','areaM2','Cd','heightM','windPa'].includes(f);
      network.connections[i][f]=numeric?n(el.value):el.value;
      saveNetwork();
    });
    document.querySelectorAll('[data-del-conn]').forEach(el=>el.onclick=()=>{
      network.connections.splice(+el.dataset.delConn,1);saveNetwork();renderConnections();
    });
  }

  function renderAll(){
    renderProjects();renderNodes();renderReference();renderConnections();clearResults();
  }

  function clearResults(){
    $('statusSolver').textContent='Sin resolver';$('statusIter').textContent='—';$('statusQuality').textContent='—';$('statusResidual').textContent='—';$('statusReference').textContent=network?.referenceNodeId?(network.nodes.find(x=>x.id===network.referenceNodeId)?.name||'—'):'—';
    $('nodeResults').innerHTML='<tr><td colspan="9" class="empty">Sin resultados.</td></tr>';
    $('connectionResults').innerHTML='<tr><td colspan="7" class="empty">Sin resultados.</td></tr>';
    $('warnings').innerHTML='<div class="empty">Resolvé la red para ejecutar la auditoría.</div>';
    clearTimeout(clearResults.timer);
    if(network?.nodes?.length&&network?.connections?.length)clearResults.timer=setTimeout(solve,350);
  }

  function modelInput(){
    return {
      referenceNodeId:network.referenceNodeId,
      referencePressurePa:n(network.referencePressurePa,0),
      nodes:network.nodes.map(x=>({...x,fixedPressurePa:x.id===network.referenceNodeId?n(network.referencePressurePa,0):null})),
      connections:network.connections.map(x=>({...x}))
    };
  }

  function solve(){
    saveNetwork();
    try{
      const res=THERMABOT_PRESSURE_ENGINE.solveNetwork(modelInput(),{toleranceKgS:1e-7,maxIterations:100,maxAbsPressurePa:500});
      renderSolution(res);
    }catch(e){
      $('statusSolver').textContent='Error';$('statusIter').textContent=String(e.message||e);
      $('warnings').innerHTML=`<div class="warn critical">${escapeHtml(String(e.message||e))}</div>`;
    }
  }

  function renderSolution(res){
    $('statusSolver').textContent=res.converged?'Convergió':'No convergió';
    $('statusSolver').className=res.converged?'ok':'bad';
    $('statusIter').textContent=`${res.iterations} iteraciones`;
    $('statusQuality').textContent=res.quality;
    $('statusResidual').textContent=Number(res.maxResidualKgS).toExponential(2);
    $('statusReference').textContent=(network.nodes.find(x=>x.id===res.referenceNodeId)?.name||res.referenceNodeId)+` · ${fmt(res.referencePressurePa,1)} Pa`;

    $('nodeResults').innerHTML=res.nodeResults.map(x=>{
      const tol=Math.max(1,Math.abs(x.targetPa)*0.15);
      const ok=Math.abs(x.errorPa)<=tol;
      return `<tr>
        <td>${escapeHtml(x.name)}</td><td><b>${fmt(x.pressurePa,2)}</b></td><td>${fmt(x.targetPa,2)}</td><td>${fmt(x.errorPa,2)}</td>
        <td>${fmt(x.supplyM3h,0)}</td><td>${fmt(x.returnM3h,0)}</td><td>${fmt(x.exhaustM3h,0)}</td><td>${x.supplyACH==null?'—':fmt(x.supplyACH,1)}</td>
        <td><span class="badge ${ok?'ok-badge':'warn-badge'}">${ok?'Objetivo OK':'Revisar'}</span></td></tr>`;
    }).join('');

    $('connectionResults').innerHTML=res.connectionResults.map(x=>{
      const from=network.nodes.find(n=>n.id===x.from)?.name||x.from,to=network.nodes.find(n=>n.id===x.to)?.name||x.to;
      const arrow=x.qM3h>=0?`${from} → ${to}`:`${to} → ${from}`;
      return `<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(arrow)}</td><td><b>${fmt(Math.abs(x.qM3h),0)}</b></td><td>${fmt(x.dpPa,2)}</td><td>${x.model}</td><td>${x.quality}</td><td><span class="badge ${x.directionOk?'ok-badge':'bad-badge'}">${x.directionOk?'OK':'INVERSO'}</span></td></tr>`;
    }).join('')||'<tr><td colspan="7" class="empty">Sin conexiones.</td></tr>';

    const list=[];
    if(!res.converged) list.push(['critical','El solver no alcanzó la tolerancia especificada.']);
    (res.warnings||[]).forEach(w=>list.push([/Flujo inverso/i.test(w)?'critical':'warn',w]));
    if(res.quality==='preliminar') list.push(['warn','La red usa uno o más coeficientes estimados. La presión calculada es preliminar; para validación final use datos medidos o de fabricante.']);
    if(!list.length) list.push(['okmsg','Red resuelta sin inconsistencias detectadas con los criterios cargados.']);
    $('warnings').innerHTML=list.map(([c,t])=>`<div class="warn ${c}">${escapeHtml(t)}</div>`).join('');
  }

  function design(){
    saveNetwork();
    try{
      lastDesign=THERMABOT_PRESSURE_ENGINE.designReturnsForTargets(modelInput());
      $('applyDesignBtn').classList.remove('hidden');
      $('nodeResults').innerHTML=lastDesign.nodeResults.map(x=>`<tr>
        <td>${escapeHtml(x.name)}</td><td>${fmt(x.targetPa,2)}</td><td>${fmt(x.targetPa,2)}</td><td>0,00</td>
        <td>${fmt(x.supplyM3h,0)}</td><td><b>${fmt(x.requiredReturnM3h,0)}</b></td><td>${fmt(x.exhaustM3h,0)}</td><td>—</td>
        <td><span class="badge ${x.feasible?'ok-badge':'bad-badge'}">${x.feasible?'Propuesta':'No viable'}</span></td></tr>`).join('');
      $('connectionResults').innerHTML=lastDesign.connectionResults.map(x=>{
        const from=network.nodes.find(n=>n.id===x.from)?.name||x.from,to=network.nodes.find(n=>n.id===x.to)?.name||x.to;
        const arrow=x.qM3h>=0?`${from} → ${to}`:`${to} → ${from}`;
        return `<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(arrow)}</td><td><b>${fmt(Math.abs(x.qM3h),0)}</b></td><td>${fmt(x.dpPa,2)}</td><td>objetivo</td><td>—</td><td>—</td></tr>`;
      }).join('');
      $('statusSolver').textContent='Diseño inverso';$('statusIter').textContent='Retornos calculados para objetivos';$('statusQuality').textContent='según fugas';$('statusResidual').textContent='—';
      const ws=lastDesign.warnings||[];
      $('warnings').innerHTML=ws.length?ws.map(w=>`<div class="warn critical">${escapeHtml(w)}</div>`).join(''):'<div class="warn okmsg">Se obtuvo una propuesta de retorno compatible con las presiones objetivo declaradas.</div>';
    }catch(e){$('warnings').innerHTML=`<div class="warn critical">${escapeHtml(String(e.message||e))}</div>`;}
  }

  function applyDesign(){
    if(!lastDesign)return;
    for(const r of lastDesign.nodeResults){
      const node=network.nodes.find(x=>x.id===r.id);
      if(node&&r.feasible) node.returnM3h=Math.max(0,r.requiredReturnM3h);
    }
    saveNetwork();renderNodes();$('applyDesignBtn').classList.add('hidden');lastDesign=null;solve();
  }

  function addNode(){
    const id=uid('zone');
    network.nodes.push({id,name:`Ambiente manual ${network.nodes.length+1}`,manual:true,volumeM3:50,supplyM3h:500,returnM3h:500,exhaustM3h:0,outdoorM3h:0,targetPa:0,temperatureC:24,rhPct:50,elevationM:0});
    if(!network.referenceNodeId) network.referenceNodeId=id;
    saveNetwork();renderAll();
  }

  function addConnection(){
    if(network.nodes.length<2){alert('Se necesitan al menos dos ambientes.');return;}
    const from=network.nodes[0].id,to=network.nodes[1].id;
    network.connections.push({id:uid('link'),name:`Conexión ${network.connections.length+1}`,from,to,model:'powerLaw',C:25,n:0.65,areaM2:0.01,Cd:0.65,heightM:0,windPa:0,preferredDirection:'either',quality:'estimated'});
    saveNetwork();renderConnections();
  }

  function loadExample(){
    const ids={tmo:uid('tmo'),esc:uid('esc'),pas:uid('pas')};
    network={
      version:1,referenceNodeId:ids.pas,referencePressurePa:0,
      nodes:[
        {id:ids.tmo,name:'Habitación TMO',manual:true,volumeM3:72,supplyM3h:1200,returnM3h:1000,exhaustM3h:0,outdoorM3h:240,targetPa:10,temperatureC:22,rhPct:50,elevationM:0},
        {id:ids.esc,name:'Esclusa',manual:true,volumeM3:18,supplyM3h:300,returnM3h:250,exhaustM3h:0,outdoorM3h:0,targetPa:5,temperatureC:22,rhPct:50,elevationM:0},
        {id:ids.pas,name:'Pasillo',manual:true,volumeM3:120,supplyM3h:0,returnM3h:250,exhaustM3h:0,outdoorM3h:0,targetPa:0,temperatureC:24,rhPct:50,elevationM:0}
      ],
      connections:[
        {id:uid('link'),name:'Puerta TMO / Esclusa',from:ids.tmo,to:ids.esc,model:'powerLaw',C:26,n:0.65,areaM2:0.01,Cd:0.65,heightM:0,windPa:0,preferredDirection:'from_to',quality:'estimated'},
        {id:uid('link'),name:'Puerta Esclusa / Pasillo',from:ids.esc,to:ids.pas,model:'powerLaw',C:23,n:0.65,areaM2:0.01,Cd:0.65,heightM:0,windPa:0,preferredDirection:'from_to',quality:'estimated'}
      ]
    };
    lastDesign=null;renderAll();
  }

  function runSelfTest(){
    try{
      const a='a',b='b',r='r';
      const base={referenceNodeId:r,referencePressurePa:0,nodes:[
        {id:a,name:'A',supplyM3h:1000,returnM3h:0,exhaustM3h:0,targetPa:10,temperatureC:22,rhPct:50},
        {id:b,name:'B',supplyM3h:300,returnM3h:0,exhaustM3h:0,targetPa:5,temperatureC:22,rhPct:50},
        {id:r,name:'R',supplyM3h:0,returnM3h:0,exhaustM3h:0,targetPa:0,fixedPressurePa:0,temperatureC:22,rhPct:50}
      ],connections:[
        {id:'ab',name:'AB',from:a,to:b,model:'powerLaw',C:20,n:.65,preferredDirection:'from_to',quality:'measured'},
        {id:'br',name:'BR',from:b,to:r,model:'powerLaw',C:20,n:.65,preferredDirection:'from_to',quality:'measured'}
      ]};
      const d=THERMABOT_PRESSURE_ENGINE.designReturnsForTargets(base);
      for(const x of d.nodeResults){const node=base.nodes.find(n=>n.id===x.id);node.returnM3h=x.requiredReturnM3h;}
      const s=THERMABOT_PRESSURE_ENGINE.solveNetwork(base);
      const maxErr=Math.max(...s.nodeResults.map(x=>Math.abs(x.pressurePa-x.targetPa)));
      if(!s.converged||maxErr>0.05) throw new Error(`self-test: error presión ${maxErr}`);
      console.info('THERMABOT pressure engine self-test OK',s);
      return true;
    }catch(e){console.error('THERMABOT pressure engine self-test FAILED',e);return false;}
  }

  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function escapeAttr(s){return escapeHtml(s);}

  function init(){
    if(!window.THERMABOT_PRESSURE_ENGINE){alert('No se cargó el motor de presiones.');return;}
    runSelfTest();
    projects=readProjects();
    currentProject=projects.find(p=>p.id===new URLSearchParams(location.search).get('balanceId'))||projects[0]||null;
    network=currentProject?mergeWithProject(currentProject.pressureNetwork||buildDefaultNetwork(currentProject),currentProject):{version:1,referenceNodeId:null,referencePressurePa:0,nodes:[],connections:[]};
    renderAll();

    $('projectSelect').onchange=loadSelectedProject;
    $('loadProjectBtn').onclick=loadSelectedProject;
    $('saveBtn').onclick=()=>{saveNetwork();if(parent!==window&&currentProject)parent.postMessage({type:'thermabot:saved',balanceId:currentProject.id,explicit:true},location.origin);$('saveBtn').textContent='Guardado ✓';setTimeout(()=>$('saveBtn').textContent='Guardar red',1200);};
    $('solveBtn').onclick=solve;$('solveMainBtn').onclick=solve;$('designBtn').onclick=design;$('applyDesignBtn').onclick=applyDesign;
    $('addNodeBtn').onclick=addNode;$('addConnectionBtn').onclick=addConnection;$('exampleBtn').onclick=loadExample;
    $('referenceNode').onchange=()=>{network.referenceNodeId=$('referenceNode').value;saveNetwork();clearResults();};
    if(parent!==window)parent.postMessage({type:'thermabot:ready',balanceId:currentProject?.id},location.origin);
    $('referencePressure').onchange=()=>{network.referencePressurePa=n($('referencePressure').value);saveNetwork();clearResults();};
  }

  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent)return;
    if(event.data?.type==='thermabot:save'){if(!currentProject){alert('Creá y guardá primero un balance con ambientes para asignar la red.');return;}saveNetwork();parent.postMessage({type:'thermabot:saved',balanceId:currentProject.id,explicit:true},location.origin);}
    if(event.data?.type==='thermabot:print'){solve();window.print();}
  });
  window.addEventListener('DOMContentLoaded',init);
})();
