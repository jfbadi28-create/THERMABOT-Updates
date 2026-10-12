(function(root){'use strict';
function folderUrl(value){try{const u=new URL(value),id=u.pathname.match(/\/folders\/([\w-]+)/)?.[1];return u.protocol==='https:'&&u.hostname==='drive.google.com'&&id?'https://drive.google.com/drive/folders/'+id:'';}catch{return '';}}
function folder(p){return p.driveFolderUrl?folderUrl(p.driveFolderUrl):folderUrl(p.sourceDriveUrl);}
function specifications(p,documents){return documents.filter(d=>d.projectId===p.id&&d.type==='Pliego');}
function primary(p,documents){const specs=specifications(p,documents);if(p.primarySpecDocumentId)return specs.find(d=>d.id===p.primarySpecDocumentId)||null;const approved=specs.filter(d=>d.current===true&&d.status==='Aprobado');if(approved.length===1)return approved[0];return specs.length===1?specs[0]:null;}
const api={folderUrl,folder,specifications,primary};if(typeof module!=='undefined')module.exports=api;else root.TBProjectDriveCore=api;
})(typeof globalThis==='undefined'?this:globalThis);
