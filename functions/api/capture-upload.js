import {g} from './tracker-sync.js';
const MAX=8*1024*1024;
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store, private'}});
export function validImage(bytes,type){if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(type==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);if(type==='image/webp')return new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';return false;}
export async function onRequest(ctx,google=g){
 const req=ctx.request;
 if(req.method==='GET'&&new URL(req.url).searchParams.get('status')==='1')return reply({configured:Boolean(ctx.env.THERMABOT_CAPTURE_FOLDER_ID&&ctx.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&ctx.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 if(req.headers.get('Origin')!==new URL(req.url).origin||req.headers.get('X-THERMABOT-Save')!=='1')return reply({error:'Origen no permitido.'},403);
 const folder=ctx.env.THERMABOT_CAPTURE_FOLDER_ID;if(!folder||!ctx.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||!ctx.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)return reply({error:'La carga de fotos todavía no está configurada. Podés guardar la visita sin foto o conservar el texto y reintentar.'},503);
 if(!/^[\w-]+$/.test(folder))return reply({error:'Carpeta de capturas inválida.'},503);
 if(Number(req.headers.get('Content-Length'))>MAX+65536)return reply({error:'La foto supera 8 MB.'},413);
 try{
  // Bound the request before parsing multipart, including clients that omit Content-Length.
  const reader=req.body?.getReader();if(!reader)return reply({error:'Falta la foto.'},400);const chunks=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX+65536){await reader.cancel();return reply({error:'La foto supera 8 MB.'},413);}chunks.push(value);}
  const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  const form=await new Response(body,{headers:{'Content-Type':req.headers.get('Content-Type')||''}}).formData(),file=form.get('photo'),projectId=String(form.get('projectId')||'');
  if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>MAX)return reply({error:'Seleccioná una imagen de hasta 8 MB.'},400);
  if(!/^[\w:-]{1,150}$/.test(projectId))return reply({error:'Proyecto inválido.'},400);
  const bytes=new Uint8Array(await file.arrayBuffer());if(!validImage(bytes,file.type))return reply({error:'Usá una imagen JPEG, PNG o WebP válida.'},400);
  const parent=await (await google(ctx.env,`https://www.googleapis.com/drive/v3/files/${folder}?fields=id,mimeType,trashed`)).json();if(parent.mimeType!=='application/vnd.google-apps.folder'||parent.trashed)return reply({error:'La carpeta de capturas no está disponible.'},503);
  const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type],name=`${projectId}-visita-${new Date().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID().slice(0,8)}.${extension}`;
  const boundary='thermabot-'+crypto.randomUUID(),encoder=new TextEncoder(),prefix=encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[folder],description:'Captura de visita THERMABOT; proyecto '+projectId})}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`),suffix=encoder.encode(`\r\n--${boundary}--\r\n`),upload=new Uint8Array(prefix.length+bytes.length+suffix.length);upload.set(prefix);upload.set(bytes,prefix.length);upload.set(suffix,prefix.length+bytes.length);
  const response=await google(ctx.env,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:upload});const result=await response.json();
  if(!result.id||!/^[\w-]+$/.test(result.id))return reply({error:'Drive no confirmó el archivo.'},502);
  return reply({file:{id:result.id,title:result.name,driveUrl:`https://drive.google.com/file/d/${result.id}/view`}},201);
 }catch{return reply({error:'No se pudo subir la foto a Drive. Conservá el texto y reintentá.'},502);}
}
