import type {ProjectInput,FactorSet} from './types.ts';
import {ASHRAE_CATALOG} from './catalogo_ashrae.ts';
import {datum,EngineeringError} from './core.ts';
import {factorErrors} from './rts.ts';
export function zoneProfile(input:ProjectInput,id:string):ProjectInput {
 const profile=ASHRAE_CATALOG.zones.find(p=>p.id===id);if(!profile)throw new EngineeringError('Tipología de ambiente no encontrada');
 if(profile.interior&&input.windows.length)throw new EngineeringError('Una tipología interior sin solar no corresponde a un ambiente con ventanas');
 const next=structuredClone(input);next.factors.rts=structuredClone(profile.rts) as FactorSet;
 if(profile.solarRts)next.factors.solarRts=structuredClone(profile.solarRts) as FactorSet;else delete next.factors.solarRts;
 for(const s of next.surfaces){s.factors={...s.factors,rts:structuredClone(next.factors.rts)};}
 for(const w of next.windows){w.factors={...w.factors,rts:structuredClone(next.factors.rts),solarRts:structuredClone(next.factors.solarRts)};}
 next.requestedMode='RTS';return next;
}
export function constructionProfile(input:ProjectInput,surfaceId:string,id:string):ProjectInput {
 const record=[...ASHRAE_CATALOG.walls,...ASHRAE_CATALOG.roofs].find(p=>p.id===id);if(!record)throw new EngineeringError('Construcción no encontrada');
 const next=structuredClone(input),s=next.surfaces.find(s=>s.id===surfaceId);if(!s)throw new EngineeringError('Cerramiento no encontrado');
 const kind=s.kind==='roof'||s.tilt.value===0?'roof':'wall';if(kind!==record.kind)throw new EngineeringError('La construcción elegida no corresponde al muro/cubierta');
 s.factors={...s.factors,cts:structuredClone(record.cts) as FactorSet};s.u=datum(record.u,'W/(m²·K)','biblioteca',record.source+' · tabla '+(kind==='wall'?19:20)+' · '+record.description);
 s.radiantFraction=datum(kind==='wall'?.46:.60,'1','biblioteca',record.source+' · tabla 17 · conducción por '+(kind==='wall'?'muros':'cubiertas'));
 return next;
}
export function factorCoverage(input:ProjectInput):{missing:string[];selectedZone:string;constructions:{id:string;name:string;description:string}[]} {
 const missing:string[]=[];if(factorErrors(input.factors.rts).length)missing.push('Tipología térmica del ambiente');
 for(const s of input.surfaces){if(factorErrors(s.factors?.cts||input.factors.cts).length)missing.push('Construcción de '+s.name);if(factorErrors(s.factors?.rts||input.factors.rts).length&&!missing.includes('Tipología térmica del ambiente'))missing.push('RTS de '+s.name);}
 for(const w of input.windows){if(factorErrors(w.factors?.rts||input.factors.rts).length&&!missing.includes('Tipología térmica del ambiente'))missing.push('RTS de '+w.name);if(factorErrors(w.factors?.solarRts||input.factors.solarRts).length)missing.push('RTS solar de '+w.name);}
 return {missing,selectedZone:input.factors.rts?.construction||'Sin seleccionar',constructions:input.surfaces.map(s=>({id:s.id,name:s.name,description:s.factors?.cts?.construction||input.factors.cts?.construction||'Sin seleccionar'}))};
}
