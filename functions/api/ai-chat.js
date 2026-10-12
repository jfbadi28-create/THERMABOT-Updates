const OPENAI_URL='https://api.openai.com/v1/responses';
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, private'}});
function outputText(r){if(typeof r?.output_text==='string'&&r.output_text)return r.output_text;return (r?.output||[]).flatMap(x=>x?.content||[]).map(x=>x?.text||x?.output_text||'').filter(Boolean).join('\n').trim();}
function cleanHistory(h){return Array.isArray(h)?h.slice(-8).filter(x=>['user','assistant'].includes(x?.role)&&typeof x?.content==='string').map(x=>({role:x.role,content:x.content.slice(0,4000)})):[]}
// Diagnóstico sin consumo de OpenAI: solo confirma si Cloudflare tiene el Secret.
export function onRequestGet(ctx){
 return json({ok:true,configured:Boolean(ctx.env.OPENAI_API_KEY),model:ctx.env.OPENAI_MODEL||'gpt-5-mini'});
}
export async function onRequestPost(ctx){
 try{
  const key=ctx.env.OPENAI_API_KEY;if(!key)return json({ok:false,code:'MISSING_API_KEY',error:'Falta configurar OPENAI_API_KEY como Secret en Cloudflare Pages (Production) y volver a desplegar.'},503);
  const body=await ctx.request.json().catch(()=>({}));const message=String(body.message||'').trim().slice(0,6000);if(!message)return json({ok:false,error:'Mensaje vacío.'},400);
  const c=body.context&&typeof body.context==='object'?body.context:{};const contextText=JSON.stringify(c).slice(0,45000);
  const instructions=`Sos THERMABOT AI, copiloto técnico integrado a una plataforma de gestión de proyectos HVAC y bioingeniería. Respondé en español rioplatense profesional, claro y compacto. Usá exclusivamente el contexto proporcionado cuando hables de proyectos del usuario; no inventes datos faltantes. Señalá inconsistencias, riesgos, próximos pasos y faltantes cuando sea útil. Para temas HVAC actuá como revisor senior, diferenciando dato registrado, inferencia y recomendación. Esta V1 es de solo lectura: nunca afirmes que modificaste proyectos, archivos o datos. Si el usuario pide una acción de escritura, explicá brevemente que todavía está en modo consulta y ofrecé el cambio como propuesta.`;
  const input=[...cleanHistory(body.history),{role:'user',content:`CONTEXTO THERMABOT (solo lectura):\n${contextText}\n\nCONSULTA:\n${message}`}];
  const r=await fetch(OPENAI_URL,{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:ctx.env.OPENAI_MODEL||'gpt-5-mini',instructions,input,max_output_tokens:2000})});
  const p=await r.json().catch(()=>({}));if(!r.ok){
   let code='OPENAI_ERROR',error='La API de OpenAI rechazó la solicitud (HTTP '+r.status+').';
   if(r.status===401||r.status===403){code='OPENAI_AUTH';error='La clave de OpenAI es inválida o no tiene permisos. Revisá OPENAI_API_KEY.';}
   else if(r.status===429){code='OPENAI_QUOTA';error='OpenAI informó un límite o cuota de uso. Revisá facturación y límites de la API.';}
   else if(r.status===404||p?.error?.code==='model_not_found'){code='OPENAI_MODEL';error='El modelo seleccionado no está disponible. Revisá OPENAI_MODEL.';}
   return json({ok:false,code,error},502);
  }
  const reply=outputText(p);if(!reply)return json({ok:false,code:'EMPTY_RESPONSE',error:'OpenAI respondió sin texto. Probá otra consulta o revisá el modelo.'},502);return json({ok:true,reply});
 }catch(e){return json({ok:false,code:'BACKEND_ERROR',error:'No se pudo completar la consulta. Revisá el funcionamiento del backend.'},500)}
}