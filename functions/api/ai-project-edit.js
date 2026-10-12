import {g} from './tracker-sync.js';
import {validate} from './workspace-sync.js';
const allowed=new Set(['priority','stage','status','progress','nextAction','nextDueDate','blocker','specRevision','drawingRevision','system','notes','waitingFor']);
const out=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const err=(error,status)=>out({ok:false,error},status);
const decode=x=>{const s=x.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s),c=>c.charCodeAt(0))))};
async function actor(request,env){
 const domain=String(env.THERMABOT_ACCESS_TEAM_DOMAIN||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
 const audience=String(env.THERMABOT_ACCESS_AUD||'').trim();
 const token=request.headers.get('Cf-Access-Jwt-Assertion')||'';
 if(!domain||!audience||!/^[-a-z0-9.]+\.cloudflareaccess\.com$/i.test(domain)||!token)return null;
 const parts=token.split('.');if(parts.length!==3)return null;
 let header,body;try{header=decode(parts[0]);body=decode(parts[1]);}catch{return null;}
 const issuer='https://'+domain;
 if(header.alg!=='RS256'||typeof header.kid!=='string'||body.iss!==issuer||!(Array.isArray(body.aud)?body.aud.includes(audience):body.aud===audience)||!Number.isFinite(body.exp)||body.exp<=Date.now()/1000||!Number.isFinite(body.iat)||body.iat>Date.now()/1000+60||!body.sub)return null;
 const keys=await fetch(issuer+'/cdn-cgi/access/certs',{redirect:'error'}).then(r=>{if(!r.ok)throw Error('JWK no disponible');return r.json()});
 const jwk=keys.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));
 if(!jwk)return null;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 const data=new TextEncoder().encode(parts[0]+'.'+parts[1]),sig=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 return await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,sig,data)?String(body.sub):null;
}
function checkValue(field,value){
 if(field==='progress')return Number.isInteger(value)&&value>=0&&value<=100;
 if(typeof value!=='string'||value.length>1500)return false;
 if(field==='nextDueDate')return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'));
 return true;
}
async function load(env){
 const id=env.THERMABOT_DRIVE_MASTER_ID;
 const etag=(await(await g(env,`https://www.googleapis.com/drive/v2/files/${id}?fields=id,etag`)).json()).etag;
 const value=validate(await(await g(env,`https://www.googleapis.com/drive/v3/files/${id}?alt=media`)).json());
 if(!etag||!value.values['thermabot.tracker.v1'])throw Error('Maestro o ETag no válido');
 return {etag,value,tracker:JSON.parse(value.values['thermabot.tracker.v1'])};
}
export async function onRequest(ctx){
 const req=ctx.request,env=ctx.env;
 if(!['GET','POST'].includes(req.method))return err('Método no permitido',405);
 if(!env.THERMABOT_DRIVE_MASTER_ID||!env.THERMABOT_DRIVE_BACKUP_ID||env.THERMABOT_DRIVE_MASTER_ID===env.THERMABOT_DRIVE_BACKUP_ID)return err('Edición no habilitada: IDs de maestro/respaldo no configurados',503);
 let who;try{who=await actor(req,env);}catch{return err('No se pudo verificar la identidad',503);}
 if(!who)return err('Acceso no autorizado',401);
 if(!env.GOOGLE_SERVICE_ACCOUNT_EMAIL||!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)return err('Conexión privada de Drive no configurada',503);
 if(req.method==='POST'&&(req.headers.get('Origin')!==new URL(req.url).origin||req.headers.get('X-THERMABOT-Confirm')!=='1'||!req.headers.get('Content-Type')?.startsWith('application/json')))return err('Confirmación/origen no válido',403);
 try{
  const {etag,value,tracker}=await load(env);
  if(!Array.isArray(tracker.projects))return err('Colección de proyectos inválida',503);
  if(req.method==='GET'){
   const id=new URL(req.url).searchParams.get('id');
   const p=tracker.projects.find(x=>x.id===id);
   if(!p)return err('Proyecto no encontrado',404);
   return out({ok:true,revision:value.revision,project:{id:p.id,name:p.name,updatedAt:p.updatedAt,fields:Object.fromEntries([...allowed].map(k=>[k,p[k]??null]))}});
  }
  const raw=await req.text();if(new TextEncoder().encode(raw).length>8192)return err('Solicitud demasiado grande',413);
  let input;try{input=JSON.parse(raw);}catch{return err('JSON inválido',400);}
  if(!input||typeof input.projectId!=='string'||typeof input.revision!=='string'||!Array.isArray(input.changes)||input.changes.length===0||input.changes.length>8)return err('Solicitud inválida',400);
  if(value.revision!==input.revision)return err('La base fue modificada desde la vista previa; recargá el proyecto',409);
  const p=tracker.projects.find(x=>x.id===input.projectId);
  if(!p)return err('Proyecto no encontrado',404);
  const used=new Set(),diff=[];
  for(const c of input.changes){
   if(!c||!allowed.has(c.field)||used.has(c.field)||!checkValue(c.field,c.after))return err('Campo o valor no permitido',400);
   used.add(c.field);
   if(JSON.stringify(p[c.field]??null)!==JSON.stringify(c.before??null))return err('El proyecto cambió desde la vista previa; revisá nuevamente',409);
   if(JSON.stringify(c.after)!==JSON.stringify(c.before))diff.push({field:c.field,before:p[c.field]??null,after:c.after});
  }
  if(!diff.length)return err('No hay cambios',400);
  const now=new Date().toISOString();
  for(const c of diff)p[c.field]=c.after;
  p.updatedAt=now;p.lastMove='Actualización confirmada desde THERMABOT AI';
  if(!Array.isArray(p.followUpLog))p.followUpLog=[];
  p.followUpLog.push({id:crypto.randomUUID(),at:now,actor:'Cloudflare Access '+who,note:'Edición aprobada por usuario',changes:diff.map(c=>({field:c.field,label:c.field,before:c.before,after:c.after})),document:null});
  tracker.updatedAt=now;value.values['thermabot.tracker.v1']=JSON.stringify(tracker);
  await g(env,`https://www.googleapis.com/upload/drive/v3/files/${env.THERMABOT_DRIVE_BACKUP_ID}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(await (async()=>{const original=await load(env);return original.value;})())});
  value.revision=crypto.randomUUID();value.updatedAt=now;
  await g(env,`https://www.googleapis.com/upload/drive/v2/files/${env.THERMABOT_DRIVE_MASTER_ID}?uploadType=media`,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(value)});
  const readback=await load(env);
  if(readback.value.revision!==value.revision||!diff.every(c=>JSON.stringify(readback.tracker.projects.find(x=>x.id===p.id)?.[c.field])===JSON.stringify(c.after)))return err('Guardado no verificable: inspeccionar Drive',502);
  return out({ok:true,revision:value.revision,projectId:p.id,applied:diff});
 }catch(e){return err(String(e.message).includes('412')?'Conflicto de edición concurrente':'No se pudo completar la operación segura de Drive',String(e.message).includes('412')?409:502);}
}
