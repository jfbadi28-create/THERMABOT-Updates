// THERMABOT v0.2.3 HOTFIX DE ARRANQUE
// Motor HVAC incorporado en este archivo para evitar fallas de carga entre scripts.
// La base visual y los datos del usuario se conservan.

const TB_ENGINE_LOCAL = (() => {
  const KW_A_KCAL = 860.0;
  const KW_A_TR = 1.0 / 3.517;

  const CIUDADES = {
    "Buenos Aires": {t:33.0, hr:59.0, lat:-34.6},
    "Córdoba": {t:35.0, hr:48.0, lat:-31.4},
    "Rosario": {t:34.5, hr:55.0, lat:-32.9},
    "Mendoza": {t:36.0, hr:32.0, lat:-32.9},
    "Salta": {t:33.0, hr:50.0, lat:-24.8},
    "Resistencia": {t:37.0, hr:60.0, lat:-27.5},
    "Bahía Blanca": {t:33.0, hr:52.0, lat:-38.7},
    "Neuquén": {t:34.0, hr:33.0, lat:-38.9},
    "Ushuaia": {t:22.0, hr:65.0, lat:-54.8},
  };

  const CERRAMIENTOS_BASE = {
    "muro-ladrillo-hueco": {nombre:"Muro ladrillo hueco 15 + revoques", U:1.95, tipo:"muro"},
    "muro-ladrillo-macizo": {nombre:"Muro ladrillo macizo 30 + revoques", U:1.55, tipo:"muro"},
    "muro-aislado-eps": {nombre:"Muro ladrillo + EPS 50 mm (IRAM 11605)", U:0.52, tipo:"muro"},
    "muro-steel": {nombre:"Steel frame + lana 100 mm", U:0.38, tipo:"muro"},
    "muro-interior": {nombre:"Tabique interior (no expuesto)", U:2.40, tipo:"muro"},
    "techo-losa": {nombre:"Losa hormigón + contrapiso (sin aislar)", U:1.90, tipo:"techo"},
    "techo-aislado": {nombre:"Losa + poliuretano 40 mm", U:0.45, tipo:"techo"},
    "techo-chapa": {nombre:"Chapa + lana de vidrio 100 mm", U:0.55, tipo:"techo"},
    "piso-contrapiso": {nombre:"Piso sobre terreno", U:0.90, tipo:"piso"},
    "piso-entrepiso": {nombre:"Entrepiso sobre local acondicionado", U:1.60, tipo:"piso"},
    "vidrio-simple": {nombre:"Vidrio simple 4 mm", U:5.80, tipo:"vidrio"},
    "vidrio-dvh": {nombre:"DVH estándar 4/12/4", U:2.80, tipo:"vidrio"},
    "vidrio-dvh-low-e": {nombre:"DVH bajo emisivo (Low-E)", U:1.80, tipo:"vidrio"},
  };

  const RADIACION_MAX = {N:115, NE:170, E:350, SE:300, S:60, SO:300, O:350, NO:170};
  const HORA_PICO = {N:13, NE:9, E:8, SE:10, S:13, SO:16, O:17, NO:16};
  const FACTOR_PROTECCION = {ninguna:1.00, cortina:0.56, persiana:0.45, alero:0.35};
  const CALOR_PERSONA = {
    reposo:[65,35], sentado:[70,45], oficina:[75,55], moderada:[100,130], intensa:[165,255]
  };
  const FACTOR_ILUMINACION = {led:1.00, incandescente:1.00, fluorescente:1.25};
  const CATALOGO_EQUIPOS = [
    {id:"split-2200", nombre:"Split muro 2.200 W", kw:2.2, tipo:"Split inverter"},
    {id:"split-3500", nombre:"Split muro 3.500 W", kw:3.5, tipo:"Split inverter"},
    {id:"split-4500", nombre:"Split muro 4.500 W", kw:4.5, tipo:"Split inverter"},
    {id:"split-6000", nombre:"Split muro 6.000 W", kw:6.0, tipo:"Split inverter"},
    {id:"piso-techo-9000", nombre:"Piso-techo 9.000 W", kw:9.0, tipo:"Piso-techo"},
    {id:"ducto-12000", nombre:"Conductos 12.000 W", kw:12.0, tipo:"Baja silueta ductos"},
    {id:"ducto-18000", nombre:"Conductos 18.000 W", kw:18.0, tipo:"Unidad de conductos"},
    {id:"vrf-24000", nombre:"VRF 24.000 W", kw:24.0, tipo:"Sistema VRF"},
    {id:"vrf-36000", nombre:"VRF 36.000 W", kw:36.0, tipo:"Sistema VRF"},
    {id:"chiller-60000", nombre:"Chiller 60 kW", kw:60.0, tipo:"Planta enfriadora"},
  ];

  const num = (v,d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  const round = (x,d=2) => {
    const p = 10 ** d;
    return Math.round((x + Number.EPSILON) * p) / p;
  };

  function p_sat(t){
    return 0.61094 * Math.exp((17.625 * t) / (t + 243.04));
  }

  function humedad_absoluta(t, hr, p_atm=101.325){
    const pv = (hr / 100.0) * p_sat(t);
    return (622.0 * pv) / (p_atm - pv);
  }

  function perfil_radiacion(horaPico, hora){
    const d = Math.abs(hora - horaPico);
    if(d >= 7) return 0;
    return Math.max(0, Math.cos((d/7.0) * (Math.PI/2.0)));
  }

  function perfil_transmision(hora){
    const f = Math.cos(((hora - 15)/9.0) * (Math.PI/2.0));
    return Math.max(0.15, f);
  }

  function cerramientosDesde(data){
    const out = {...CERRAMIENTOS_BASE};
    if(Array.isArray(data)){
      for(const c of data){
        if(c && c.id) out[c.id] = c;
      }
    } else if(data && typeof data === "object"){
      Object.assign(out, data);
    }
    return out;
  }

  function seleccionar_equipo(totalKw){
    const candidatos = CATALOGO_EQUIPOS.filter(e => e.kw >= totalKw);
    const recomendado = candidatos[0] || CATALOGO_EQUIPOS[CATALOGO_EQUIPOS.length-1];
    const holgura = ((recomendado.kw / Math.max(totalKw, 0.001)) - 1.0) * 100.0;
    return {recomendado, holgura_pct: round(holgura,1)};
  }

  function calcular_ambiente(amb, cond, cerramientosData){
    const cerramientos = cerramientosDesde(cerramientosData);
    const superficie = num(amb.largo) * num(amb.ancho);
    const volumen = superficie * num(amb.altura, 2.8);
    const deltaT = num(cond.tempExterior,33) - num(cond.tempInterior,24);
    const wExt = humedad_absoluta(num(cond.tempExterior,33), num(cond.humedadExterior,59));
    const wInt = humedad_absoluta(num(cond.tempInterior,24), num(cond.humedadInterior,50));
    const deltaW = Math.max(0, wExt - wInt);
    const partidas = [];
    const alertas = [];

    const areaVidrioPorOrient = {};
    for(const v of (amb.ventanas || [])){
      const a = num(v.ancho) * num(v.alto) * num(v.cantidad,1);
      areaVidrioPorOrient[v.orientacion] = (areaVidrioPorOrient[v.orientacion] || 0) + a;
    }

    for(const m of (amb.muros || [])){
      const areaBruta = num(m.largo) * num(amb.altura,2.8);
      const areaVent = areaVidrioPorOrient[m.orientacion] || 0;
      const areaNeta = Math.max(0, areaBruta - areaVent);
      const u = num(cerramientos[m.cerramientoId]?.U, 1.95);
      const dt = m.exterior ? deltaT : 0;
      const q = (u * areaNeta * dt) / 1000.0;
      if(areaVent > areaBruta) alertas.push(`Ventana al ${m.orientacion} supera la superficie del muro.`);
      partidas.push({id:`muro-${m.orientacion}`,grupo:"local",concepto:`Muro ${m.orientacion}${m.exterior?"":" (interior)"}`,sensible_kw:q,latente_kw:0,area_m2:areaNeta,U:u});
    }

    const uTecho = num(cerramientos[amb.techoCerramientoId]?.U,1.90);
    const dtTecho = amb.techoExpuesto ? deltaT + 8.0 : 0;
    partidas.push({id:"techo",grupo:"local",concepto:amb.techoExpuesto?"Techo expuesto":"Techo interior",sensible_kw:(uTecho*superficie*dtTecho)/1000,latente_kw:0,area_m2:superficie,U:uTecho});

    const uPiso = num(cerramientos[amb.pisoCerramientoId]?.U,0.90);
    const dtPiso = amb.pisoExpuesto ? deltaT*0.5 : 0;
    partidas.push({id:"piso",grupo:"local",concepto:amb.pisoExpuesto?"Piso expuesto":"Piso interior",sensible_kw:(uPiso*superficie*dtPiso)/1000,latente_kw:0,area_m2:superficie,U:uPiso});

    for(const v of (amb.ventanas || [])){
      const area = num(v.ancho)*num(v.alto)*num(v.cantidad,1);
      const u = num(cerramientos[v.vidrioId]?.U,2.80);
      const qCond = (u*area*deltaT)/1000;
      const rad = num(RADIACION_MAX[v.orientacion],115);
      const fProt = num(FACTOR_PROTECCION[v.proteccion],1);
      const fHora = perfil_radiacion(num(HORA_PICO[v.orientacion],12), num(cond.horaDiseno,15));
      const qRad = (area*rad*num(v.factorSombra,0.85)*fProt*fHora)/1000;
      partidas.push({id:`vidrio-cond-${v.orientacion}`,grupo:"local",concepto:`Ventana ${v.orientacion} (conducción)`,sensible_kw:qCond,latente_kw:0,area_m2:area,U:u});
      partidas.push({id:`vidrio-rad-${v.orientacion}`,grupo:"local",concepto:`Ventana ${v.orientacion} (radiación solar)`,sensible_kw:qRad,latente_kw:0,area_m2:area,rad_max:rad});
    }

    const cp = CALOR_PERSONA[amb.actividad] || [75,55];
    partidas.push({id:"personas",grupo:"local",concepto:`Personas (${num(amb.personas)} pers, ${amb.actividad})`,sensible_kw:(num(amb.personas)*cp[0])/1000,latente_kw:(num(amb.personas)*cp[1])/1000});

    const fIlum = num(FACTOR_ILUMINACION[amb.iluminacionTipo],1);
    partidas.push({id:"iluminacion",grupo:"local",concepto:`Iluminación (${amb.iluminacionTipo || "led"})`,sensible_kw:(num(amb.iluminacionW)*fIlum)/1000,latente_kw:0});

    partidas.push({id:"equipos",grupo:"local",concepto:"Equipos eléctricos / computación",sensible_kw:num(amb.equiposW)/1000,latente_kw:num(amb.equiposLatenteW)/1000});

    const caudalExt = amb.aireExteriorModo === "persona"
      ? num(amb.personas)*num(amb.aireExteriorPorPersona)
      : volumen*num(amb.aireExteriorACH);

    partidas.push({id:"aire-exterior",grupo:"exterior",concepto:`Aire exterior ventilación (${caudalExt.toFixed(0)} m³/h)`,sensible_kw:(0.34*caudalExt*deltaT)/1000,latente_kw:(0.83*caudalExt*deltaW)/1000});

    const fs = 1 + num(amb.factorSeguridad)/100;
    const sum = (g,k) => partidas.filter(p=>p.grupo===g).reduce((a,p)=>a+num(p[k]),0)*fs;
    const localS = sum("local","sensible_kw"), localL = sum("local","latente_kw");
    const extS = sum("exterior","sensible_kw"), extL = sum("exterior","latente_kw");
    const sensible = localS + extS, latente = localL + extL, total = sensible + latente;
    const fcs = total > 0 ? sensible/total : 1;
    const caudalImp = num(amb.deltaTImpulsion) > 0 ? (localS*1000)/(0.34*num(amb.deltaTImpulsion)) : 0;

    const curva = [];
    for(let hora=0; hora<24; hora++){
      let kw=0;
      for(const p of partidas){
        if(p.id.startsWith("vidrio-rad-")){
          const orient = p.id.split("-").pop();
          const pico = num(HORA_PICO[orient],13);
          const fAct = perfil_radiacion(pico,hora);
          const fDis = perfil_radiacion(pico,num(cond.horaDiseno,15));
          const base = fDis > 0 ? p.sensible_kw/fDis : p.sensible_kw;
          kw += base*fAct;
        } else if(p.grupo==="exterior" || p.id.startsWith("muro-") || ["techo","piso"].includes(p.id) || p.id.startsWith("vidrio-cond-")){
          kw += (p.sensible_kw+p.latente_kw)*perfil_transmision(hora);
        } else if(hora>=8 && hora<=20){
          kw += p.sensible_kw+p.latente_kw;
        }
      }
      curva.push([hora, round(kw*fs,2)]);
    }

    if(superficie>0){
      const wm2 = (total*1000)/superficie;
      if(wm2>350) alertas.push(`Carga térmica muy alta: ${Math.round(wm2)} W/m².`);
      else if(wm2<40) alertas.push(`Carga térmica baja: ${Math.round(wm2)} W/m² (verificar datos).`);
    }

    const result = {
      nombre:amb.nombre,
      superficie_m2:round(superficie,2),
      volumen_m3:round(volumen,2),
      local_sensible_kw:round(localS,2),
      local_latente_kw:round(localL,2),
      ext_sensible_kw:round(extS,2),
      ext_latente_kw:round(extL,2),
      sensible_total_kw:round(sensible,2),
      latente_total_kw:round(latente,2),
      total_kw:round(total,2),
      total_kcal_h:round(total*KW_A_KCAL,0),
      total_tr:round(total*KW_A_TR,2),
      fcs:round(fcs,2),
      caudal_impulsion_m3h:round(caudalImp,0),
      caudal_aire_exterior_m3h:round(caudalExt,0),
      curva_horaria:curva,
      alertas,
      partidas:partidas.map(p=>({...p,sensible_kw:round(p.sensible_kw*fs,3),latente_kw:round(p.latente_kw*fs,3)}))
    };
    result.equipo = seleccionar_equipo(result.total_kw);
    return result;
  }

  return {CIUDADES,CERRAMIENTOS_BASE,CATALOGO_EQUIPOS,calcular_ambiente,seleccionar_equipo};
})();


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
      const resultado=TB_ENGINE_LOCAL.calcular_ambiente(p.ambiente||{},p.condiciones||{},p.cerramientos||[]);
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
 try{
   const r=await apiCall("calcular_ambiente",{ambiente:a,condiciones:p.condiciones,cerramientos:p.cerramientos});
   if(r?.ok){
     state.result=r.result;
     renderResult();
   }else{
     state.result=null;
     renderResult();
     $("ambientMeta").textContent=`Error de cálculo · ${r?.error||"sin detalle"}`;
     $("alerts").innerHTML=`<div class="alert">Error de cálculo: ${r?.error||"sin detalle"}</div>`;
   }
 }catch(e){
   state.result=null;
   renderResult();
   $("ambientMeta").textContent=`Error de cálculo · ${String(e)}`;
   $("alerts").innerHTML=`<div class="alert">Error de cálculo: ${String(e)}</div>`;
 }
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
 const requested=new URLSearchParams(location.search).get('balanceId');
 state.projectId=state.projects.find(p=>p.id===requested)?.id||state.projects[0].id;state.ambientId=proj().ambientes[0].id;

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

async function arranqueSeguro(){
  try{
    await init();
  }catch(e){
    console.error("Error durante init:", e);
    try{
      const p=proj(), a=amb();
      const r=TB_ENGINE_LOCAL.calcular_ambiente(
        a || defaultAmbient("Living comedor"),
        (p && p.condiciones) || defaultProject().condiciones,
        (p && p.cerramientos) || []
      );
      state.result=r;
      try{ renderResult(); }catch(_){}
      if($("ambientMeta")) $("ambientMeta").textContent =
        `${p?.nombre||"Proyecto"} · ${p?.condiciones?.ciudad||"Buenos Aires"} · ${fmt(r.superficie_m2,1)} m² · ${convertTotal(r,state.unit)}`;
    }catch(e2){
      console.error("Error en cálculo de rescate:", e2);
      if($("ambientMeta")) $("ambientMeta").textContent=`ERROR: ${String(e2)}`;
      if($("alerts")) $("alerts").innerHTML=`<div class="alert">Error: ${String(e2)}</div>`;
    }
  }

  // Rescate adicional: si por cualquier razón quedó en "calculando…",
  // ejecuta el motor directamente sin pasar por la capa API.
  setTimeout(()=>{
    if(state.result) return;
    try{
      const p=proj(), a=amb();
      const r=TB_ENGINE_LOCAL.calcular_ambiente(a,p.condiciones,p.cerramientos||[]);
      state.result=r;
      renderResult();
    }catch(e){
      console.error("Rescate tardío:",e);
      if($("ambientMeta")) $("ambientMeta").textContent=`ERROR: ${String(e)}`;
      if($("alerts")) $("alerts").innerHTML=`<div class="alert">Error: ${String(e)}</div>`;
    }
  },300);
}

window.addEventListener("DOMContentLoaded",arranqueSeguro);

// Service Worker: se mantiene, pero sin forzar recargas automáticas.
if("serviceWorker" in navigator){
  window.addEventListener("load",async()=>{
    try{
      const reg=await navigator.serviceWorker.register("./sw.js");
      await reg.update();
    }catch(e){
      console.warn("Service Worker no disponible:",e);
    }
  });
}
