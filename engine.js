const THERMABOT_ENGINE = (() => {
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
