// No third-party runtime: share the existing thermal engine and compile TypeScript with Node.
import {readFile,writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {basename} from 'node:path';
const root=new URL('../quadri/',import.meta.url),out=new URL('./',import.meta.url);
const names=['types','core','psicrometria','catalogo_ashrae','rts','bibliotecas_rts','solar','envolvente','geometria_edificio','particiones','cargas_internas','ventilacion','seleccion_equipos','catalogo_quadri','revision_carga','seguridad_datos','quadri','index','demo','casos_quadri','edificio','integracion_agua'];
let bundle='const modules=Object.create(null);\n';
for(const name of [...names,'tables','motor_web','app']){
 const path=['tables','motor_web','app'].includes(name)?new URL(name+'.ts',out):new URL('src/engine/'+name+'.ts',root);
 let js=stripTypeScriptTypes(await readFile(path,'utf8'),{mode:'strip'});
 const exported=[...js.matchAll(/export\s+(?:function|const|class)\s+(\w+)/g)].map(m=>m[1]);
 js=js.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/g,(_,list,path)=>'const {'+list+'}=modules['+JSON.stringify(basename(path,'.ts'))+'];');
 js=js.replace(/export\s+(?=(function|const|class)\s)/g,'');
 js=js.replace(/[ \t]+$/gm,'');
 bundle+='modules['+JSON.stringify(name)+']=(()=>{\n'+js+'\nreturn {'+exported.join(',')+'};})();\n';
}
await writeFile(new URL('app.js',out),bundle);
console.log('Calculador de agua web construido.');
