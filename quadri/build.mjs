import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {dirname,join,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url));
const names=['types','core','psicrometria','catalogo_ashrae','rts','bibliotecas_rts','solar','envolvente','geometria_edificio','particiones','cargas_internas','ventilacion','seleccion_equipos','catalogo_quadri','revision_carga','seguridad_datos','quadri','index','demo','casos_quadri','edificio'];
let bundle='const modules=Object.create(null);\n';
for(const name of [...names,'app']){
 const path=name==='app'?join(root,'src/ui/app.ts'):join(root,'src/engine',name+'.ts');
 let js=stripTypeScriptTypes(await readFile(path,'utf8'),{mode:'strip'});
 const exported=[...js.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map(m=>m[1]);
 js=js.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,list,path)=>'const {'+list+'}=modules['+JSON.stringify(basename(path,'.ts'))+'];');
 js=js.replace(/export\s+(?=(function|const|class)\s)/g,'');
 if(/\b(?:import|export)\s/.test(js.replace(/\/\/[^\n]*/g,'')))throw new Error('Import/export sin empaquetar en '+name);
 bundle+='modules['+JSON.stringify(name)+']=(()=>{\n'+js+'\nreturn {'+exported.join(',')+'};})();\n';
}
const css=await readFile(join(root,'src/ui/styles.css'),'utf8');
const shell=await readFile(join(root,'src/index.html'),'utf8');
const icons=await readFile(join(root,'vendor/lucide.min.js'),'utf8');
const pdf=await readFile(join(root,'vendor/pdf-lib.min.js'),'utf8');
const html=shell.replace('<!-- STYLES -->',()=>'<style>'+css+'</style>').replace('<!-- SCRIPTS -->',()=>'<script>'+icons+'</script><script>'+pdf+'</script><script src="../cloud-sync.js"></script><script>TBCloudReady.then(()=>{'+bundle.replace(/<\/script/gi,'<\\/script')+'});</script>');
await writeFile(join(root,'index.html'),html);
await writeFile(join(root,'dist-app.js'),bundle);
console.log('Prueba construida: '+join(root,'index.html')+' · '+Buffer.byteLength(html)+' bytes');
