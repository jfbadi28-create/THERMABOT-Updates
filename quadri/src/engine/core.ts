import type {Datum,Provenance,Trace,Unit,Variable,Warning} from './types.ts';
export const ENGINE_VERSION='2.3.0-preview.1';
export const CONTRACT='MOTOR_TERMICO_V2.md';
export class EngineeringError extends Error {code:string;path:string;constructor(message:string,path='',code='INVALID_INPUT'){super(message);this.name='EngineeringError';this.code=code;this.path=path;}}
export function finite(x:number,path=''):number {if(typeof x!=='number'||!Number.isFinite(x))throw new EngineeringError('NaN/Infinity o valor no numérico',path);return x;}
export function range(x:number,min:number,max:number,path=''):number {finite(x,path);if(x<min||x>max)throw new EngineeringError(`Valor fuera de ${min}…${max}`,path);return x;}
export function nonnegative(x:number,path=''):number {finite(x,path);if(x<0)throw new EngineeringError('Magnitud negativa no permitida',path);return x;}
export function positive(x:number,path=''):number {finite(x,path);if(x<=0)throw new EngineeringError('El valor debe ser > 0',path);return x;}
export function datum(value:number,unit:Unit,provenance:Provenance='ingresado',source='Carga manual'):Datum {return {value:finite(value),unit,provenance,source};}
export function validateDatum(d:Datum,path=''):void {if(!d||!d.source?.trim())throw new EngineeringError('Falta procedencia/fuente',path);finite(d.value,path);if(!['ingresado','heredado','calculado','medido','biblioteca','supuesto'].includes(d.provenance))throw new EngineeringError('Procedencia inválida',path);}
const units:Record<string,{dimension:string;scale:number;offset?:number}>={
 'kcal/h':{dimension:'power',scale:1/.86},'W/(m²·K)':{dimension:'U',scale:1},'kcal/(h·m²·°C)':{dimension:'U',scale:1/.86},'g/kg':{dimension:'humidity',scale:.001},'kg_w/kg_da':{dimension:'humidity',scale:1},'m³/min':{dimension:'flow',scale:1/60},'W':{dimension:'power',scale:1},'kW':{dimension:'power',scale:1000},
 'm³/s':{dimension:'flow',scale:1},'m³/h':{dimension:'flow',scale:1/3600},
 'Pa':{dimension:'pressure',scale:1},'kPa':{dimension:'pressure',scale:1000},
 '°C':{dimension:'temperature',scale:1},'K':{dimension:'temperature',scale:1,offset:-273.15},
 'kJ/kg_da':{dimension:'enthalpy',scale:1},'J/kg_da':{dimension:'enthalpy',scale:.001},
 '%':{dimension:'fraction',scale:.01},'1':{dimension:'fraction',scale:1},
};
export function convert(value:number,from:string,to:string):number {finite(value);if(from===to)return value;const a=units[from],b=units[to];if(!a||!b||a.dimension!==b.dimension)throw new EngineeringError(`Conversión incompatible: ${from} → ${to}`,'unit','UNIT_MISMATCH');return finite((value*a.scale+(a.offset||0)-(b.offset||0))/b.scale);}
export function numberOf(d:Datum,unit:Unit,path=''):number {validateDatum(d,path);return convert(d.value,d.unit,unit);}
export function variable(d:Datum):Variable {validateDatum(d);return {...d};}
export function calculated(value:number|number[]|string,unit:string,source:string):Variable {return {value,unit,provenance:'calculado',source};}
export function constant(value:number,unit:string,section:string):Variable {return {value,unit,provenance:'biblioteca',source:`${CONTRACT} §${section}`};}
export function trace(id:string,label:string,equation:string,variables:Record<string,Variable>,result:number|number[]|null,unit:string,section:string,warnings:string[]=[]):Trace {if(result!==null)(Array.isArray(result)?result:[result]).forEach(v=>finite(v,id));return {id,label,equation,variables,result,unit,source:`${CONTRACT} §${section}`,engineVersion:ENGINE_VERSION,warnings};}
export function hourly(a:Datum[],unit:Unit,path:string):number[] {if(!Array.isArray(a)||a.length!==24)throw new EngineeringError('Se requieren exactamente 24 valores horarios',path);return a.map((d,i)=>numberOf(d,unit,`${path}[${i}]`));}
export function fraction(d:Datum,path=''):number {return range(numberOf(d,'1',path),0,1,path);}
export function uniqueWarnings(a:Warning[]):Warning[] {return [...new Map(a.map(w=>[w.code+'|'+w.path,w])).values()];}
export function validateTree(x:unknown,path='input'):void {if(typeof x==='number')finite(x,path);else if(Array.isArray(x))x.forEach((v,i)=>validateTree(v,`${path}[${i}]`));else if(x&&typeof x==='object')Object.entries(x).forEach(([k,v])=>validateTree(v,`${path}.${k}`));}
