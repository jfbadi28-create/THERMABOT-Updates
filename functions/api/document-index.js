import {g,hasGoogleCredentials} from './tracker-sync.js';
import * as loaded from '../../document-index-core.js';
const core=loaded.default||globalThis.TBDocumentIndexCore;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});

export async function readIndex(env,google=g){
  const id=env.THERMABOT_DOCUMENT_INDEX_SHEET_ID;
  if(!id||!/^[\w-]+$/.test(id))throw Error('INDEX_NOT_CONFIGURED');
  const read=async range=>{
    const response=await google(env,`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
    return (await response.json()).values||[];
  };
  // Reject a larger grid rather than silently hiding rows beyond the supported bound.
  const meta=await (await google(env,`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets(properties(title,gridProperties(rowCount)))`)).json();
  const bound=(title,maximum)=>{
    const count=meta.sheets?.find(s=>s.properties?.title===title)?.properties?.gridProperties?.rowCount;
    if(!Number.isInteger(count)||count<1)throw Error('INDEX_SCHEMA_INVALID');
    if(count>maximum)throw Error('INDEX_TOO_LARGE');
    return count;
  };
  const [files,works]=await Promise.all([read("'F1 - INVENTARIO TOTAL'!A1:V"+bound('F1 - INVENTARIO TOTAL',6000)),read("'CONTROL ESTRUCTURAL'!A1:I"+bound('CONTROL ESTRUCTURAL',1000))]);
  if(files.length>6000||works.length>1000)throw Error('INDEX_TOO_LARGE');
  const parsed=core.parseIndex(files,works);const autoTab=meta.sheets?.find(s=>s.properties.title==='AUTO - INVENTARIO DRIVE');if(autoTab){const count=autoTab.properties.gridProperties.rowCount;if(count>6001)throw Error('INDEX_TOO_LARGE');const rows=await read("'AUTO - INVENTARIO DRIVE'!A1:K"+count);if(rows[0]?.[0]!=='ID'||rows[0]?.[8]!=='Versión Drive')throw Error('INDEX_SCHEMA_INVALID');const docs=new Map(parsed.documents.map(d=>[d.id,d]));const seen=new Set();for(const r of rows.slice(1)){const id=String(r[0]||'').trim();if(!id)continue;if(!/^[\w-]+$/.test(id)||seen.has(id))throw Error('INDEX_SCHEMA_INVALID');seen.add(id);const previous=docs.get(id)||{};docs.set(id,{...previous,id,code:r[1]||'',section:r[2]||'',path:r[3]||'',title:r[4]||'',format:r[5]||'',modifiedAt:r[6]||'',driveUrl:core.driveUrl(r[7]),version:r[8]||'',driveStatus:r[9]||'unverified',checkedAt:r[10]||'',type:previous.type||'Por clasificar',revision:previous.title===r[4]?previous.revision||String(r[4]||'').match(/(?:^|[ _-])(R[0-9]+)/i)?.[1]||'':String(r[4]||'').match(/(?:^|[ _-])(R[0-9]+)/i)?.[1]||'',state:previous.state||'APROBACIÓN NO VERIFICADA',action:previous.action||'Clasificar documento'});}parsed.documents=[...docs.values()];if(parsed.documents.length>6000)throw Error('INDEX_TOO_LARGE');}
  return {...parsed,sourceUrl:`https://docs.google.com/spreadsheets/d/${id}/edit`,checkedAt:new Date().toISOString()};
}

export async function onRequest(ctx){
  if(ctx.request.method!=='GET')return reply({error:'Método no permitido.'},405);
  if(!hasGoogleCredentials(ctx.env)||!ctx.env.THERMABOT_DOCUMENT_INDEX_SHEET_ID)return reply({error:'El índice documental de Drive todavía no está conectado.',code:'INDEX_NOT_CONFIGURED'},503);
  try{return reply(await readIndex(ctx.env));}
  catch(error){const code=error.message==='INDEX_TOO_LARGE'?'INDEX_TOO_LARGE':'INDEX_UNAVAILABLE';return reply({error:code==='INDEX_TOO_LARGE'?'El índice supera el tamaño admitido; debe ampliarse antes de consultarlo.':'No se pudo verificar el índice documental. Revisá su configuración y acceso en Drive.',code},502);}
}
