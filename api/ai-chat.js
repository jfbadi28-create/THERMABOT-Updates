const OPENAI_URL = 'https://api.openai.com/v1/responses';

function corsHeaders(origin='') {
  const allowed = origin === 'https://jfbadi28-create.github.io'
    ? origin
    : 'https://jfbadi28-create.github.io';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store, private'
  };
}

function outputText(r){
  if(typeof r?.output_text === 'string' && r.output_text) return r.output_text;
  return (r?.output || []).flatMap(x => x?.content || [])
    .map(x => x?.text || x?.output_text || '').filter(Boolean).join('\n').trim();
}

function cleanHistory(h){
  return Array.isArray(h)
    ? h.slice(-8)
      .filter(x => ['user','assistant'].includes(x?.role) && typeof x?.content === 'string')
      .map(x => ({role:x.role, content:x.content.slice(0,4000)}))
    : [];
}

export default async function handler(req,res){
  const origin = req.headers.origin || '';
  const headers = corsHeaders(origin);
  Object.entries(headers).forEach(([k,v])=>res.setHeader(k,v));
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method !== 'POST') return res.status(405).json({ok:false,error:'Método no permitido.'});

  try{
    const key = process.env.OPENAI_API_KEY;
    if(!key) return res.status(503).json({ok:false,error:'Falta configurar OPENAI_API_KEY en Vercel.'});

    const body = req.body || {};
    const message = String(body.message || '').trim().slice(0,6000);
    if(!message) return res.status(400).json({ok:false,error:'Mensaje vacío.'});

    const c = body.context && typeof body.context === 'object' ? body.context : {};
    const contextText = JSON.stringify(c).slice(0,45000);

    const instructions = `Sos THERMABOT AI, copiloto técnico integrado a una plataforma de gestión de proyectos HVAC y bioingeniería. Respondé en español rioplatense profesional, claro y compacto. Usá exclusivamente el contexto proporcionado cuando hables de proyectos del usuario; no inventes datos faltantes. Señalá inconsistencias, riesgos, próximos pasos y faltantes cuando sea útil. Para temas HVAC actuá como revisor senior, diferenciando dato registrado, inferencia y recomendación. Esta V1 es de solo lectura: nunca afirmes que modificaste proyectos, archivos o datos. Si el usuario pide una acción de escritura, explicá brevemente que todavía está en modo consulta y ofrecé el cambio como propuesta.`;

    const input = [
      ...cleanHistory(body.history),
      {role:'user',content:`CONTEXTO THERMABOT (solo lectura):\n${contextText}\n\nCONSULTA:\n${message}`}
    ];

    const r = await fetch(OPENAI_URL,{
      method:'POST',
      headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_MODEL || 'gpt-5.6-mini',
        instructions,
        input,
        max_output_tokens:1200
      })
    });

    const p = await r.json().catch(()=>({}));
    if(!r.ok) return res.status(502).json({ok:false,error:p?.error?.message || `OpenAI API ${r.status}`});
    return res.status(200).json({ok:true,reply:outputText(p) || 'No pude generar una respuesta.'});
  }catch(e){
    return res.status(500).json({ok:false,error:e?.message || String(e)});
  }
}
