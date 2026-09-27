const STEPS = ["clima","geometria","envolvente","ventanas","internas","aire","equipo"];
const CIUDADES = {
  "Buenos Aires": {t:33,hr:59,lat:-34.6},"Córdoba":{t:35,hr:48,lat:-31.4},
  "Rosario":{t:34.5,hr:55,lat:-32.9},"Mendoza":{t:36,hr:32,lat:-32.9},
  "Salta":{t:33,hr:50,lat:-24.8},"Resistencia":{t:37,hr:60,lat:-27.5},
  "Bahía Blanca":{t:33,hr:52,lat:-38.7},"Neuquén":{t:34,hr:33,lat:-38.9},"Ushuaia":{t:22,hr:65,lat:-54.8}
};
const MATERIALS = {
 "muro-ladrillo-hueco":["Muro ladrillo hueco 15 + revoques","muro"],
 "muro-ladrillo-macizo":["Muro ladrillo macizo 30 + revoques","muro"],
 "muro-aislado-eps":["Muro ladrillo + EPS 50 mm","muro"],
 "muro-steel":["Steel frame + lana 100 mm","muro"],
 "muro-interior":["Tabique interior","muro"],
 "techo-losa":["Losa hormigón + contrapiso","techo"],
 "techo-aislado":["Losa + poliuretano 40 mm","techo"],
 "techo-chapa":["Chapa + lana de vidrio 100 mm","techo"],
 "piso-contrapiso":["Piso sobre terreno","piso"],
 "piso-entrepiso":["Entrepiso sobre local acondicionado","piso"],
 "vidrio-simple":["Vidrio simple 4 mm","vidrio"],
 "vidrio-dvh":["DVH estándar 4/12/4","vidrio"],
 "vidrio-dvh-low-e":["DVH Low-E","vidrio"]
};
const TEMPLATES = [
 ["Consultorio",{largo:4,ancho:3,personas:3,actividad:"oficina",equiposW:300,iluminacionW:150}],
 ["Sala de espera",{largo:8,ancho:6,personas:20,actividad:"sentado",equiposW:200,iluminacionW:480}],
 ["Oficina",{largo:5,ancho:4,personas:4,actividad:"oficina",equiposW:600,iluminacionW:200}],
 ["Recepción",{largo:5,ancho:4,personas:4,actividad:"oficina",equiposW:400,iluminacionW:200}],
 ["Habitación",{largo:5,ancho:3.5,personas:2,actividad:"reposo",equiposW:200,iluminacionW:120}],
 ["Pasillo",{largo:10,ancho:2,personas:2,actividad:"moderada",equiposW:0,iluminacionW:150,ventanas:[]}]
];
const uid = p => `${p}-${Math.random().toString(36).slice(2,9)}`;
const defaultAmbient = (name="Ambiente 1") => ({
 id:uid("amb"),nombre:name,largo:5,ancho:4,altura:2.6,
 muros:[
  {id:uid("m"),orientacion:"N",largo:5,cerramientoId:"muro-aislado-eps",exterior:true},
  {id:uid("m"),orientacion:"O",largo:4,cerramientoId:"muro-aislado-eps",exterior:true}
 ],
 techoCerramientoId:"techo-aislado",techoExpuesto:true,pisoCerramientoId:"piso-entrepiso",pisoExpuesto:false,
 ventanas:[{id:uid("v"),orientacion:"N",ancho:1.5,alto:1.2,cantidad:1,vidrioId:"vidrio-dvh",factorSombra:.87,proteccion:"cortina"}],
 personas:3,actividad:"sentado",iluminacionW:200,iluminacionTipo:"led",equiposW:250,equiposLatenteW:0,
 aireExteriorModo:"persona",aireExteriorPorPersona:30,aireExteriorACH:1.5,deltaTImpulsion:11,factorSeguridad:5
});
const defaultProject = (name="Residencia Valle Alto") => {
 const c=CIUDADES["Buenos Aires"];
 return {id:uid("prj"),nombre:name,cliente:"",ubicacion:"Buenos Aires",modo:"simple",
 condiciones:{ciudad:"Buenos Aires",tempExterior:c.t,humedadExterior:c.hr,tempInterior:24,humedadInterior:50,horaDiseno:15,latitud:c.lat},
 ambientes:[defaultAmbient("Living comedor")],cerramientos:[]};
};

let state={projects:[defaultProject()],projectId:null,ambientId:null,step:"clima",unit:"kW",templateIndex:0,result:null};
const $=id=>document.getElementById(id);
const proj=()=>state.projects.find(p=>p.id===state.projectId)||state.projects[0];
const amb=()=>proj().ambientes.find(a=>a.id===state.ambientId)||proj().ambientes[0];
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const fmt=(x,d=2)=>Number(x||0).toLocaleString("es-AR",{minimumFractionDigits:d,maximumFractionDigits:d});

function optionsFor(type, selected){
 return Object.entries(MATERIALS).filter(([,x])=>x[1]===type).map(([id,x])=>`<option value="${id}" ${id===selected?"selected":""}>${x[0]}</option>`).join("");
}
function orientOptions(sel){return ["N","NE","E","SE","S","SO","O","NO"].map(x=>`<option ${x===sel?"selected":""}>${x}</option>`).join("");}

async function apiCall(name,...args){
  const STORAGE_KEY="thermabot.proyectos.v1";
  if(name==="cargar_proyectos"){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      return {ok:true,proyectos:raw?JSON.parse(raw):[]};
    }catch(e){return {ok:false,error:String(e),proyectos:[]};}
  }
  if(name==="guardar_proyectos"){
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(args[0]||[]));
      return {ok:true,ruta:"almacenamiento local del navegador"};
    }catch(e){return {ok:false,error:String(e)};}
  }
  if(name==="calcular_ambiente"){
    try{
      const p=args[0]||{};
      const resultado=THERMABOT_ENGINE.calcular_ambiente(p.ambiente||{},p.condiciones||{},p.cerramientos||[]);
      return {ok:true,resultado};
    }catch(e){return {ok:false,error:String(e)};}
  }
  if(name==="guardar_informe"){
    try{
      const blob=new Blob([String(args[0]||"")],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download="informe_thermabot.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      return {ok:true,ruta:"Descargas/informe_thermabot.txt"};
    }catch(e){return {ok:false,error:String(e)};}
  }
  return {ok:false,error:`API local no implementada: ${name}`};
}
async function save(){
 $("saveStatus").textContent="Guardando…";
 const r=await apiCall("guardar_proyectos",state.projects);
 $("saveStatus").textContent=r?.ok===false?"Error al guardar":`Guardado ${new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}`;
}
let calcTimer=null;
function changed(){
 clearTimeout(calcTimer); calcTimer=setTimeout(async()=>{await save();await calculate();renderChrome();},80);
}
async function calculate(){
 const p=proj(),a=amb();
 const r=await apiCall("calcular_ambiente",{ambiente:a,condiciones:p.condiciones,cerramientos:p.cerramientos});
 if(r?.ok){state.result=r.result;renderResult();}
 else {state.result=null; renderResult();}
}
function convertTotal(r,unit){
 if(!r)return "—";
 if(unit==="kcal/h")return `${fmt(r.total_kcal_h,0)} kcal/h`;
 if(unit==="TR")return `${fmt(r.total_tr,2)} TR`;
 return `${fmt(r.total_kw,2)} kW`;
}

function renderChrome(){
 const p=proj(),a=amb(),r=state.result;
 $("projectSelect").innerHTML=state.projects.map(x=>`<option value="${x.id}" ${x.id===p.id?"selected":""}>${x.nombre}</option>`).join("");
 $("ambientList").innerHTML=p.ambientes.map(x=>`<button class="ambient-btn ${x.id===a.id?"active":""}" data-a="${x.id}">${x.nombre}</button>`).join("");
 $("ambientPills").innerHTML=p.ambientes.map(x=>`<button class="ambient-pill ${x.id===a.id?"active":""}" data-a="${x.id}">${x.nombre}</button>`).join("");
 $("ambientCount").textContent=p.ambientes.length;
 $("ambientTitle").textContent=a.nombre;$("summaryName").textContent=a.nombre;$("summaryCity").textContent=p.condiciones.ciudad;
 $("ambientMeta").textContent=`${p.nombre} · ${p.condiciones.ciudad} · ${r?fmt(r.superficie_m2,1):fmt(a.largo*a.ancho,1)} m² · ${r?convertTotal(r,state.unit):"calculando…"}`;
 $("modeBtn").textContent=`Modo ${p.modo==="simple"?"rápido":"profesional"}`;
 document.querySelectorAll(".unit").forEach(b=>b.classList.toggle("active",b.dataset.unit===state.unit));
 document.querySelectorAll(".step").forEach(b=>b.classList.toggle("active",b.dataset.step===state.step));
 document.querySelectorAll(".step-panel").forEach(x=>x.classList.remove("active-panel"));
 $(`step-${state.step}`).classList.add("active-panel");
 STEPS.forEach((s,i)=>document.querySelector(`[data-step="${s}"]`)?.setAttribute("aria-current",s===state.step?"step":"false"));
 bindAmbientSelectors();
}
function bindAmbientSelectors(){
 document.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{state.ambientId=b.dataset.a;fillForm();calculate();renderChrome();});
}

function fillForm(){
 const p=proj(),a=amb(),c=p.condiciones;
 $("ciudad").innerHTML=Object.keys(CIUDADES).map(x=>`<option ${x===c.ciudad?"selected":""}>${x}</option>`).join("");
 [["horaDiseno",c.horaDiseno],["tempExterior",c.tempExterior],["humedadExterior",c.humedadExterior],["tempInterior",c.tempInterior],["humedadInterior",c.humedadInterior],
 ["nombreAmbiente",a.nombre],["largo",a.largo],["ancho",a.ancho],["altura",a.altura],["personas",a.personas],["actividad",a.actividad],
 ["iluminacionW",a.iluminacionW],["iluminacionTipo",a.iluminacionTipo],["equiposW",a.equiposW],["equiposLatenteW",a.equiposLatenteW],
 ["aireExteriorModo",a.aireExteriorModo],["aireExteriorPorPersona",a.aireExteriorPorPersona],["aireExteriorACH",a.aireExteriorACH],["deltaTImpulsion",a.deltaTImpulsion],["factorSeguridad",a.factorSeguridad]]
 .forEach(([id,v])=>{$(id).value=v??"";});
 $("techoCerramiento").innerHTML=optionsFor("techo",a.techoCerramientoId);$("pisoCerramiento").innerHTML=optionsFor("piso",a.pisoCerramientoId);
 $("techoExpuesto").checked=!!a.techoExpuesto;$("pisoExpuesto").checked=!!a.pisoExpuesto;
 renderWalls();renderWindows();
}
function renderWalls(){
 const a=amb();$("wallsContainer").innerHTML=a.muros.map((m,i)=>`
 <div class="row-card card"><div class="row-grid">
 <label>Orientación<select data-wall="${i}" data-field="orientacion">${orientOptions(m.orientacion)}</select></label>
 <label>Largo [m]<input data-wall="${i}" data-field="largo" type="number" min="0" step=".1" value="${m.largo}"/></label>
 <label>Cerramiento<select data-wall="${i}" data-field="cerramientoId">${optionsFor("muro",m.cerramientoId)}</select></label>
 <label class="checkline"><input data-wall="${i}" data-field="exterior" type="checkbox" ${m.exterior?"checked":""}/> Exterior</label>
 <button class="remove" data-del-wall="${i}">×</button>
 </div></div>`).join("");
 document.querySelectorAll("[data-wall]").forEach(el=>el.onchange=()=>{const i=+el.dataset.wall,f=el.dataset.field;amb().muros[i][f]=el.type==="checkbox"?el.checked:(f==="largo"?n(el.value):el.value);changed();});
 document.querySelectorAll("[data-del-wall]").forEach(el=>el.onclick=()=>{amb().muros.splice(+el.dataset.delWall,1);renderWalls();changed();});
}
function renderWindows(){
 const a=amb();$("windowsContainer").innerHTML=a.ventanas.map((v,i)=>`
 <div class="row-card card"><div class="row-grid window">
 <label>Orient.<select data-win="${i}" data-field="orientacion">${orientOptions(v.orientacion)}</select></label>
 <label>Ancho [m]<input data-win="${i}" data-field="ancho" type="number" min="0" step=".1" value="${v.ancho}"/></label>
 <label>Alto [m]<input data-win="${i}" data-field="alto" type="number" min="0" step=".1" value="${v.alto}"/></label>
 <label>Cant.<input data-win="${i}" data-field="cantidad" type="number" min="1" step="1" value="${v.cantidad}"/></label>
 <label>Vidrio<select data-win="${i}" data-field="vidrioId">${optionsFor("vidrio",v.vidrioId)}</select></label>
 <label>F. sombra<input data-win="${i}" data-field="factorSombra" type="number" min="0" max="1" step=".01" value="${v.factorSombra}"/></label>
 <label>Protección<select data-win="${i}" data-field="proteccion">${["ninguna","cortina","persiana","alero"].map(x=>`<option ${x===v.proteccion?"selected":""}>${x}</option>`).join("")}</select></label>
 <button class="remove" data-del-win="${i}">×</button>
 </div></div>`).join("");
 document.querySelectorAll("[data-win]").forEach(el=>el.onchange=()=>{const i=+el.dataset.win,f=el.dataset.field;amb().ventanas[i][f]=["ancho","alto","cantidad","factorSombra"].includes(f)?n(el.value):el.value;changed();});
 document.querySelectorAll("[data-del-win]").forEach(el=>el.onclick=()=>{amb().ventanas.splice(+el.dataset.delWin,1);renderWindows();changed();});
}
function renderResult(){
 const r=state.result,a=amb();
 if(!r){
  ["sumTotal","sumSensible","sumLatente","sumFcs","sumWm2","sumSupply","sumOutdoor"].forEach(id=>$(id).textContent="—");return;
 }
 $("sumTotal").textContent=convertTotal(r,state.unit);
 $("sumSecondary").textContent=`${fmt(r.total_kcal_h,0)} kcal/h · ${fmt(r.total_tr,2)} TR`;
 $("sumSensible").textContent=`${fmt(r.sensible_total_kw,2)} kW`;
 $("sumLatente").textContent=`${fmt(r.latente_total_kw,2)} kW`;
 $("sumFcs").textContent=fmt(r.fcs,2);
 $("sumWm2").textContent=r.superficie_m2?`${fmt(r.total_kw*1000/r.superficie_m2,0)}`:"—";
 $("sumSupply").textContent=`${fmt(r.caudal_impulsion_m3h,0)} m³/h`;
 $("sumOutdoor").textContent=`${fmt(r.caudal_aire_exterior_m3h,0)} m³/h`;
 $("geoArea").textContent=`${fmt(r.superficie_m2,2)} m²`;$("geoVolume").textContent=`${fmt(r.volumen_m3,2)} m³`;
 $("airExteriorMetric").textContent=`${fmt(r.caudal_aire_exterior_m3h,0)} m³/h`;$("airSupplyMetric").textContent=`${fmt(r.caudal_impulsion_m3h,0)} m³/h`;
 const e=r.equipo?.recomendado;
 $("sumEquip").textContent=e?`${e.nombre} · ${fmt(e.kw,1)} kW`:"—";
 $("equipName").textContent=e?.nombre||"—";$("equipCapacity").textContent=e?`${fmt(e.kw,1)} kW`:"—";$("equipType").textContent=e?.tipo||"—";$("equipMargin").textContent=r.equipo?`${fmt(r.equipo.holgura_pct,1)} %`:"—";
 $("alerts").innerHTML=(r.alertas||[]).map(x=>`<div class="alert">${x}</div>`).join("");
 $("breakdown").innerHTML=(r.partidas||[]).map(x=>`<div class="breakdown-row"><span>${x.concepto}</span><b>${fmt(x.sensible_kw,3)} kW S</b><b>${fmt(x.latente_kw,3)} kW L</b></div>`).join("");
 renderChrome();
}
function formEvents(){
 const cMap={horaDiseno:"horaDiseno",tempExterior:"tempExterior",humedadExterior:"humedadExterior",tempInterior:"tempInterior",humedadInterior:"humedadInterior"};
 Object.entries(cMap).forEach(([id,k])=>$(id).onchange=()=>{proj().condiciones[k]=n($(id).value);changed();});
 $("ciudad").onchange=()=>{const city=$("ciudad").value,x=CIUDADES[city];Object.assign(proj().condiciones,{ciudad:city,tempExterior:x.t,humedadExterior:x.hr,latitud:x.lat});fillForm();changed();};
 const aNum=["largo","ancho","altura","personas","iluminacionW","equiposW","equiposLatenteW","aireExteriorPorPersona","aireExteriorACH","deltaTImpulsion","factorSeguridad"];
 aNum.forEach(k=>$(k).onchange=()=>{amb()[k]=n($(k).value);changed();});
 ["actividad","iluminacionTipo","aireExteriorModo","techoCerramiento","pisoCerramiento"].forEach(k=>$(k).onchange=()=>{const map={techoCerramiento:"techoCerramientoId",pisoCerramiento:"pisoCerramientoId"};amb()[map[k]||k]=$(k).value;changed();});
 $("nombreAmbiente").onchange=()=>{amb().nombre=$("nombreAmbiente").value.trim()||"Ambiente";changed();renderChrome();};
 $("techoExpuesto").onchange=()=>{amb().techoExpuesto=$("techoExpuesto").checked;changed();};$("pisoExpuesto").onchange=()=>{amb().pisoExpuesto=$("pisoExpuesto").checked;changed();};
}

function modal(title,html){$("modalTitle").textContent=title;$("modalBody").innerHTML=html;$("modal").classList.remove("hidden");}
function reportText(){
 const p=proj(),r=state.result,a=amb();
 return `THERMABOT\nProyecto: ${p.nombre}\nAmbiente: ${a.nombre}\nCiudad: ${p.condiciones.ciudad}\n\nCarga total: ${r?fmt(r.total_kw,2):"—"} kW\nSensible: ${r?fmt(r.sensible_total_kw,2):"—"} kW\nLatente: ${r?fmt(r.latente_total_kw,2):"—"} kW\nCaudal impulsión: ${r?fmt(r.caudal_impulsion_m3h,0):"—"} m3/h\n`;
}

async function init(){
 const loaded=await apiCall("cargar_proyectos");
 if(loaded?.ok && loaded.proyectos?.length)state.projects=loaded.proyectos;
 state.projectId=state.projects[0].id;state.ambientId=state.projects[0].ambientes[0].id;

 TEMPLATES.forEach(([name],i)=>{const b=document.createElement("button");b.className="template-pill"+(i===0?" active":"");b.textContent=name;b.onclick=()=>{state.templateIndex=i;document.querySelectorAll(".template-pill").forEach((x,j)=>x.classList.toggle("active",j===i));};$("templatePills").appendChild(b);});
 $("templateQty").oninput=()=>{$("addTemplate").textContent=`Agregar ${$("templateQty").value}`;};

 $("projectSelect").onchange=()=>{state.projectId=$("projectSelect").value;state.ambientId=proj().ambientes[0].id;fillForm();calculate();renderChrome();};
 $("newProject").onclick=()=>{const name=prompt("Nombre del proyecto:",`Proyecto ${state.projects.length+1}`);if(name===null)return;const p=defaultProject(name.trim()||`Proyecto ${state.projects.length+1}`);state.projects.unshift(p);state.projectId=p.id;state.ambientId=p.ambientes[0].id;fillForm();changed();};
 $("addAmbient").onclick=()=>{const a=defaultAmbient(`Ambiente ${proj().ambientes.length+1}`);proj().ambientes.push(a);state.ambientId=a.id;fillForm();changed();};
 $("dupAmbient").onclick=()=>{const a=JSON.parse(JSON.stringify(amb()));a.id=uid("amb");a.nombre+= " (copia)";a.muros=(a.muros||[]).map(m=>({...m,id:uid("m")}));a.ventanas=(a.ventanas||[]).map(v=>({...v,id:uid("v")}));proj().ambientes.push(a);state.ambientId=a.id;fillForm();changed();};
 $("delAmbient").onclick=()=>{if(proj().ambientes.length<=1)return modal("No se puede eliminar","El proyecto debe conservar al menos un ambiente.");const i=proj().ambientes.findIndex(x=>x.id===amb().id);proj().ambientes.splice(i,1);state.ambientId=proj().ambientes[0].id;fillForm();changed();};
 $("dupMany").onclick=()=>{const count=Math.max(1,Math.min(50,n($("dupCount").value,1)));const base=amb();for(let i=0;i<count;i++){const a=JSON.parse(JSON.stringify(base));a.id=uid("amb");a.nombre=`${base.nombre.replace(/\s*\d+$/,"")} ${proj().ambientes.length+1}`;a.muros=(a.muros||[]).map(m=>({...m,id:uid("m")}));a.ventanas=(a.ventanas||[]).map(v=>({...v,id:uid("v")}));proj().ambientes.push(a);}changed();};
 $("quickToggle").onclick=()=>{$("quickBody").classList.toggle("hidden");$("quickToggle").textContent=$("quickBody").classList.contains("hidden")?"+ Carga rápida":"Cerrar";};
 $("addTemplate").onclick=()=>{const [name,patch]=TEMPLATES[state.templateIndex],qty=Math.max(1,Math.min(100,n($("templateQty").value,1))),existing=proj().ambientes.filter(a=>a.nombre.startsWith(name)).length;let first=null;for(let i=0;i<qty;i++){const a={...defaultAmbient(`${name} ${existing+i+1}`),...JSON.parse(JSON.stringify(patch)),id:uid("amb")};proj().ambientes.push(a);if(!first)first=a;}state.ambientId=first.id;fillForm();changed();};
 $("addList").onclick=()=>{const names=$("pasteList").value.split("\n").map(x=>x.trim()).filter(Boolean);if(!names.length)return;let first=null;names.forEach(name=>{const t=TEMPLATES.find(([n])=>name.toLowerCase().startsWith(n.toLowerCase()));const a={...defaultAmbient(name),...(t?JSON.parse(JSON.stringify(t[1])):{}),id:uid("amb")};proj().ambientes.push(a);if(!first)first=a;});$("pasteList").value="";state.ambientId=first.id;fillForm();changed();};

 document.querySelectorAll(".step").forEach(b=>b.onclick=()=>{state.step=b.dataset.step;renderChrome();});
 $("prevStep").onclick=()=>{const i=STEPS.indexOf(state.step);if(i>0){state.step=STEPS[i-1];renderChrome();}};
 $("nextStep").onclick=()=>{const i=STEPS.indexOf(state.step);if(i<STEPS.length-1){state.step=STEPS[i+1];renderChrome();}};
 document.querySelectorAll(".unit").forEach(b=>b.onclick=()=>{state.unit=b.dataset.unit;renderResult();});
 $("modeBtn").onclick=()=>{proj().modo=proj().modo==="simple"?"profesional":"simple";changed();};
 $("addWall").onclick=()=>{amb().muros.push({id:uid("m"),orientacion:"N",largo:amb().largo,cerramientoId:"muro-aislado-eps",exterior:true});renderWalls();changed();};
 $("addWindow").onclick=()=>{amb().ventanas.push({id:uid("v"),orientacion:"N",ancho:1.2,alto:1.2,cantidad:1,vidrioId:"vidrio-dvh",factorSombra:.85,proteccion:"cortina"});renderWindows();changed();};
 $("aiBtn").onclick=()=>modal("Eficiencia con IA","<p>La interfaz conserva este módulo, pero no se conectó ningún servicio de IA externo. Así la app portable funciona sin Internet ni claves API.</p>");
 $("reportBtn").onclick=async()=>{const t=reportText();const r=await apiCall("guardar_informe",t);modal("Informe",r?.ok?`<p>Informe guardado en:</p><code>${r.ruta}</code>`:`<pre>${t}</pre>`);};
 $("modalClose").onclick=()=>$("modal").classList.add("hidden");$("modal").onclick=e=>{if(e.target===$("modal"))$("modal").classList.add("hidden");};

 formEvents();fillForm();renderChrome();await calculate();
}
window.addEventListener("DOMContentLoaded",init);

if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js");
      await reg.update();
      let reloading=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{
        if(reloading)return;
        reloading=true;
        location.reload();
      });
      setInterval(()=>reg.update(),5*60*1000);
    }catch(e){
      console.warn("Service Worker no disponible:",e);
    }
  });
}
