// Apply to imported JSON before it enters application state or calculation code.
export function validateImportedData(data:unknown):void {
 let nodes=0;
 const visit=(value:unknown,depth:number)=>{
  if(++nodes>150000||depth>40)throw Error('Archivo demasiado complejo para importar.');
  if(value===null||typeof value!=='object')return;
  for(const [key,child] of Object.entries(value)){
   if(['__proto__','prototype','constructor'].includes(key))throw Error('Archivo rechazado: contiene una propiedad no permitida.');
   visit(child,depth+1);
  }
 };
 visit(data,0);
}
export function escapeHtml(value:unknown):string {
 return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
