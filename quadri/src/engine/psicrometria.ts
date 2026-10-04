import type {AirState,Datum,Result} from './types.ts';
import {datum,numberOf,positive,range,trace,variable,calculated,constant,EngineeringError,finite} from './core.ts';
export function atmosphericPressure(altitude:Datum):Result<Datum> {const z=numberOf(altitude,'m');const base=positive(1-2.25577e-5*z,'altitud');const p=positive(101325*Math.pow(base,5.2559));return {value:datum(p,'Pa','calculado','Contrato §3.1: presión por altitud'),warnings:[],trace:[trace('p-atm','Presión atmosférica','P = 101325 · (1 − 2.25577×10⁻⁵ z)^5.2559',{z:variable(altitude)},p,'Pa','3.1')]};}
export function saturationPressure(t:number):number {range(t,-100,200,'temperatura psicrométrica');const T=t+273.15;const log=t<=0?-5674.5359/T+6.3925247-.009677843*T+6.2215701e-7*T*T+2.0747825e-9*T**3-9.484024e-13*T**4+4.1635019*Math.log(T):-5800.2206/T+1.3914993-.048640239*T+4.1764768e-5*T*T-1.4452093e-8*T**3+6.5459673*Math.log(T);return Math.exp(log);}
export function humidityRatio(t:number,rh:number,p:number):number {range(rh,0,1,'RH');positive(p,'presión');const pw=rh*saturationPressure(t);if(pw>=p)throw new EngineeringError('Presión de vapor ≥ presión atmosférica','estado');return .621945*pw/(p-pw);}
export function rhFromHumidity(t:number,w:number,p:number,allowSupersaturation=false):number {range(w,0,Infinity,'W');positive(p,'P');const rh=p*w/(.621945+w)/saturationPressure(t);if(!allowSupersaturation&&rh>1+1e-8)throw new EngineeringError('Estado sobresaturado no declarado','RH','SUPERSATURATED');return rh;}
export function dewPoint(pw:number):number|null {if(pw===0)return null;positive(pw);if(pw<saturationPressure(-100)||pw>saturationPressure(200))return null;let lo=-100,hi=200;for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(saturationPressure(mid)>pw)hi=mid;else lo=mid;}return (lo+hi)/2;}
export function wetBulb(t:number,w:number,p:number):number|null {
 // The supplied §3.10 expression describes liquid water. Do not silently
 // substitute an ice formula when a subzero wet-bulb solution is required.
 const humidityAt=(tw:number)=>{const ws=humidityRatio(tw,1,p);return ((2501-2.326*tw)*ws-1.006*(t-tw))/(2501+1.86*t-4.186*tw);};
 if(t<0||w<humidityAt(0))return null;
 let lo=0,hi=t;for(let i=0;i<90;i++){const mid=(lo+hi)/2;if(humidityAt(mid)>w)hi=mid;else lo=mid;}return (lo+hi)/2;
}
export function airState(temperature:Datum,rh:Datum,pressure:Datum,id='air'):AirState {
 const t=numberOf(temperature,'°C'),f=range(numberOf(rh,'1'),0,1,'RH'),p=positive(numberOf(pressure,'Pa'),'P');
 const pws=saturationPressure(t),pw=f*pws,w=humidityRatio(t,f,p),h=1.006*t+w*(2501+1.86*t),v=.287042*(t+273.15)*(1+1.607858*w)/(p/1000),tdp=dewPoint(pw),twb=wetBulb(t,w,p);
 const warnings=twb===null?[{code:'WET_BULB_OUTSIDE_CONTRACT',path:id,message:'Bulbo húmedo bajo cero: §3.10 no especifica formulación sobre hielo. Resultado no disponible.'}]:[];
 const td=[trace(id+'-pws','Presión de saturación',t<=0?'ln(Pws) = C1/T + C2 + C3T + C4T² + C5T³ + C6T⁴ + C7 ln(T)':'ln(Pws) = C8/T + C9 + C10T + C11T² + C12T³ + C13 ln(T)',{t:variable(temperature),T:calculated(t+273.15,'K','t + 273.15'),coeficientes:calculated(t<=0?[-5674.5359,6.3925247,-.009677843,6.2215701e-7,2.0747825e-9,-9.484024e-13,4.1635019]:[-5800.2206,1.3914993,-.048640239,4.1764768e-5,-1.4452093e-8,6.5459673],'mixtas','Contrato §3.2')},pws,'Pa','3.2'),
 trace(id+'-pw','Presión parcial de vapor','Pw = RH · Pws',{RH:variable(rh),Pws:calculated(pws,'Pa',id+'-pws')},pw,'Pa','3.3'),
 trace(id+'-w','Humedad específica','W = ε Pw / (P − Pw)',{epsilon:constant(.621945,'1','2'),Pw:calculated(pw,'Pa',id+'-pw'),P:variable(pressure)},w,'kg_w/kg_da','3.4'),
 trace(id+'-h','Entalpía','h = 1.006 t + W(2501 + 1.86 t)',{t:variable(temperature),W:calculated(w,'kg_w/kg_da',id+'-w'),cp_da:constant(1.006,'kJ/(kg_da·K)','2'),cp_v:constant(1.86,'kJ/(kg_w·K)','2'),hfg:constant(2501,'kJ/kg_w','2')},h,'kJ/kg_da','3.5'),
 trace(id+'-v','Volumen específico','v = R_da (t + 273.15)(1 + 1.607858 W) / P_kPa',{t:variable(temperature),W:calculated(w,'kg_w/kg_da',id+'-w'),P:variable(pressure),R_da:constant(.287042,'kPa·m³/(kg_da·K)','2')},v,'m³/kg_da','3.6'),
 trace(id+'-rho-dry','Densidad de aire seco','ρ_da = 1/v',{v:calculated(v,'m³/kg_da',id+'-v')},1/v,'kg_da/m³','3.7'),
 trace(id+'-rho-moist','Densidad de aire húmedo','ρ_moist = (1+W)/v',{W:calculated(w,'kg_w/kg_da',id+'-w'),v:calculated(v,'m³/kg_da',id+'-v')},(1+w)/v,'kg/m³','3.7'),
 trace(id+'-dew','Punto de rocío','Pws(Tdp) = Pw · bisección',{Pw:calculated(pw,'Pa',id+'-pw')},tdp,'°C','3.9',tdp===null?['No hay solución finita en el dominio −100…200 °C']:[]),
 trace(id+'-wet','Bulbo húmedo termodinámico','W = {[(2501 − 2.326 Twb) Ws] − 1.006(Tdb − Twb)} / [2501 + 1.86 Tdb − 4.186 Twb]',{Tdb:variable(temperature),W:calculated(w,'kg_w/kg_da',id+'-w'),P:variable(pressure)},twb,'°C','3.10',warnings.map(w=>w.message))];
 [h,v,w].forEach(x=>finite(x));return {temperature,rh,pressure,w,h,v,pws,pw,rhoDry:1/v,rhoMoist:(1+w)/v,dewPoint:tdp,wetBulb:twb,trace:td,warnings};
}
export function mixAir(streams:{mass:Datum;state:AirState}[]):Result<{mass:number;w:number;h:number;t:number}> {if(!streams.length)throw new EngineeringError('Mezcla sin corrientes');const masses=streams.map(s=>range(numberOf(s.mass,'kg_da/s'),0,Infinity,'m_da'));const m=positive(masses.reduce((a,b)=>a+b,0));const w=streams.reduce((a,s,i)=>a+masses[i]*s.state.w,0)/m,h=streams.reduce((a,s,i)=>a+masses[i]*s.state.h,0)/m,t=(h-2501*w)/(1.006+1.86*w);return {value:{mass:m,w,h,t},warnings:[],trace:[trace('mix','Mezcla con base en aire seco','Wmix=Σ(m Wi)/Σm; hmix=Σ(m hi)/Σm; Tmix=(hmix−2501 Wmix)/(1.006+1.86 Wmix)',{m:calculated(masses,'kg_da/s','Corrientes ingresadas'),Wi:calculated(streams.map(s=>s.state.w),'kg_w/kg_da','Estados psicrométricos'),hi:calculated(streams.map(s=>s.state.h),'kJ/kg_da','Estados psicrométricos')},[m,w,h,t],'kg_da/s; kg_w/kg_da; kJ/kg_da; °C','16')]};}
