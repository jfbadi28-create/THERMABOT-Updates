import {runMaintenance} from '../functions/api/drive-automation.js';
export default {
 async scheduled(_event,env,ctx){ctx.waitUntil(runMaintenance(env).then(result=>{console.log(JSON.stringify({running:result.running,remaining:result.remaining,documents:result.documents,warnings:result.warnings}));}));},
 async fetch(){return new Response('Programador privado de mantenimiento THERMABOT. Sin acciones públicas.',{status:404});}
};
