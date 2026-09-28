// THERMABOT · Recalculo en vivo
// Mantiene intacto el motor HVAC: solo hace que los campos numericos
// existentes disparen su handler de cambio mientras el usuario escribe.
(function(){
  'use strict';

  const LIVE_IDS = new Set([
    'horaDiseno','tempExterior','humedadExterior','tempInterior','humedadInterior',
    'largo','ancho','altura','personas','iluminacionW','equiposW','equiposLatenteW',
    'aireExteriorPorPersona','aireExteriorACH','deltaTImpulsion','factorSeguridad'
  ]);

  function num(v){
    const x=Number(v);
    return Number.isFinite(x)?x:0;
  }

  function updateGeometryPreview(){
    const largo=document.getElementById('largo');
    const ancho=document.getElementById('ancho');
    const altura=document.getElementById('altura');
    const areaEl=document.getElementById('geoArea');
    const volumeEl=document.getElementById('geoVolume');
    if(!largo||!ancho||!altura||!areaEl||!volumeEl) return;

    const area=Math.max(0,num(largo.value))*Math.max(0,num(ancho.value));
    const volume=area*Math.max(0,num(altura.value));
    areaEl.textContent=`${area.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})} m²`;
    volumeEl.textContent=`${volume.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2})} m³`;
  }

  function shouldRecalculate(el){
    if(!(el instanceof HTMLInputElement)) return false;
    if(LIVE_IDS.has(el.id)) return true;
    if(el.matches('[data-wall][type="number"], [data-win][type="number"]')) return true;
    return false;
  }

  let pending=new WeakMap();

  document.addEventListener('input',event=>{
    const el=event.target;
    if(!shouldRecalculate(el)) return;

    if(el.id==='largo'||el.id==='ancho'||el.id==='altura') updateGeometryPreview();

    // Debounce muy corto: evita ejecutar dos veces durante una pulsacion rapida,
    // pero mantiene la respuesta visual practicamente instantanea.
    const old=pending.get(el);
    if(old) clearTimeout(old);
    const timer=setTimeout(()=>{
      pending.delete(el);
      // Reutiliza exactamente el onchange que ya posee THERMABOT.
      // De esta forma no se duplica ni modifica ninguna formula.
      if(typeof el.onchange==='function') el.onchange.call(el,new Event('change',{bubbles:true}));
      else el.dispatchEvent(new Event('change',{bubbles:true}));
    },25);
    pending.set(el,timer);
  });

  // Vista previa correcta desde el primer render.
  window.addEventListener('DOMContentLoaded',()=>setTimeout(updateGeometryPreview,0));
})();
