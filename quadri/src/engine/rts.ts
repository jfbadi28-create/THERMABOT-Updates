import type {FactorSet,Result,Trace,Surface} from './types.ts';
import {finite,range,trace,calculated,EngineeringError,numberOf} from './core.ts';
import {ASHRAE_CATALOG} from './catalogo_ashrae.ts';
export function publishedFactor(f?:FactorSet){if(!f?.libraryId)return undefined;return ASHRAE_CATALOG.factors.find(r=>r.id===f.libraryId);}
export function constructionErrors(s:Surface,f?:FactorSet):string[]{
 if(!f?.libraryId)return [];
 const record=[...ASHRAE_CATALOG.walls,...ASHRAE_CATALOG.roofs].find(r=>r.id===f.libraryId);
 if(!record)return ['CTS no corresponde a una construcción opaca de biblioteca'];
 const kind=s.kind==='roof'||numberOf(s.tilt,'°')===0?'roof':'wall';
 if(record.kind!==kind)return ['CTS de muro/cubierta incompatible con el cerramiento'];
 if(Math.abs(numberOf(s.u,'W/(m²·K)')-record.u)>1e-9)return ['U modificada: elegí una construcción coherente o ingresá CTS propios con su fuente'];
 return [];
}
export function factorErrors(f?:FactorSet):string[] {
 if(!f)return ['factores no suministrados'];const e:string[]=[];
 if([f.source,f.construction,f.version].some(v=>typeof v!=='string'||!v.trim()))e.push('falta fuente, construcción o versión');
 if(!['ingresado','heredado','calculado','medido','biblioteca','supuesto'].includes(f.provenance))e.push('procedencia no válida');
 if(!Array.isArray(f.values)||f.values.length!==24)e.push('longitud distinta de 24');
 else {if(f.values.some(v=>!Number.isFinite(v)||v<0))e.push('coeficiente negativo o no finito');
  const record=publishedFactor(f),sum=f.values.reduce((a,b)=>a+b,0);
  if(f.libraryId&&(!record||f.source!==record.factor.source||f.version!==record.factor.version||f.construction!==record.factor.construction||f.provenance!=='biblioteca'||f.values.some((v,j)=>v!==record.factor.values[j])))e.push('serie de biblioteca modificada o desconocida; importá una serie independiente con su fuente y sin libraryId');
  // Only exact bundled tabulations can use their published rounding interval.
  // User-supplied coefficients retain the original 1e-6 sum validation.
  const tolerance=record&&f.values.every((v,j)=>v===record.factor.values[j])?24*record.percentStep/200:1e-6;
  if(Math.abs(sum-1)>tolerance+1e-12)e.push('suma distinta de 1 fuera de la precisión declarada');
 }
 return e;
}
export function convolve24(gains:number[],f:FactorSet,id='cts'):Result<number[]> {if(gains.length!==24)throw new EngineeringError('Perfil incompleto',id);gains.forEach(x=>finite(x,id));const e=factorErrors(f);if(e.length)throw new EngineeringError('factores no válidos: '+e.join('; '),id,'INVALID_FACTORS');const record=publishedFactor(f),sum=f.values.reduce((a,b)=>a+b,0),rounding=record&&Math.abs(sum-1)>1e-6?[{code:'PUBLISHED_FACTOR_ROUNDING',path:id,message:'Serie ASHRAE tabulada: suma '+(sum*100).toFixed(1)+'% por redondeo a '+record.percentStep+' puntos porcentuales. Se conservan los coeficientes publicados sin normalizar.'}]:[];const load=gains.map((_,t)=>f.values.reduce((a,c,j)=>a+c*gains[(t-j+24)%24],0));return {value:load,warnings:rounding,trace:[trace(id,'Convolución horaria','q(t)=Σ[j=0…23] f[j] · q[(t−j+24) mod 24]',{ganancia:calculated(gains,'W','Ganancia previa'),factores:{value:f.values,unit:'1',source:f.source+' · '+f.construction+' · '+f.version,provenance:f.provenance},suma:calculated(sum,'1','Suma original de coeficientes, sin normalizar'),precision:calculated(record?record.percentStep+' puntos porcentuales':'suma ±1e-6','1',record?f.source:'Validación de serie ingresada'),historia:{value:'Día de diseño periódico: las 24 horas previas repiten el día suministrado',unit:'1',source:'Hipótesis de cálculo explícita',provenance:'supuesto'}},load,'W',id.includes('cts')?'6.3':'6.4',rounding.map(w=>w.message))]};}
export function coolingLoad(gains:number[],radiantFraction:number,f:FactorSet|undefined,mode:'RTS'|'instantaneo',fallback:'instantaneo'|'error',id:string):Result<{load:number[];mode:'RTS'|'instantaneo'}> {range(radiantFraction,0,1,id+'.frad');if(gains.length!==24)throw new EngineeringError('Perfil incompleto',id);gains.forEach(x=>finite(x,id));if(mode==='instantaneo')return {value:{load:[...gains],mode:'instantaneo'},warnings:[],trace:[trace(id,'Carga instantánea declarada','Q(t) = q(t)',{q:calculated(gains,'W','Ganancia sensible')},gains,'W','6.4')]};const e=factorErrors(f);if(e.length){if(fallback==='error')throw new EngineeringError('factores no válidos: '+e.join('; '),id,'INVALID_FACTORS');return {value:{load:[...gains],mode:'instantaneo'},warnings:[{code:'INVALID_FACTORS',path:id,message:'warning: factores no válidos — '+e.join('; ')+'. Modo instantáneo declarado.'}],trace:[trace(id,'Conversión instantánea por factores no válidos','Q(t)=q(t) · sin retardo RTS',{q:calculated(gains,'W','Ganancia sensible')},gains,'W','6.4',e)]};}
 const rad=gains.map(q=>q*radiantFraction),cv=gains.map(q=>q*(1-radiantFraction)),r=convolve24(rad,f!,id+'-rts');const load=r.value.map((q,t)=>q+cv[t]);return {value:{load,mode:'RTS'},warnings:r.warnings,trace:[...r.trace,trace(id,'Sensible convectiva + radiante retardada','Q(t)=(1−frad)q(t)+Σ r[j] frad q(t−j)',{q:calculated(gains,'W','Ganancia sensible'),frad:calculated(radiantFraction,'1','Fracción declarada'),qconv:calculated(cv,'W','(1−frad)q'),qrad:calculated(rad,'W','frad q')},load,'W','6.4')]};}
export function conduction24(gains:number[],f:FactorSet|undefined,mode:'RTS'|'instantaneo',fallback:'instantaneo'|'error',id:string):Result<{load:number[];mode:'RTS'|'instantaneo'}> {return coolingLoad(gains,1,f,mode,fallback,id+'-cts');}
