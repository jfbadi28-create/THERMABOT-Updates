// Run: node --test tests/thermabot-ai-suite.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../thermabot-ai-suite.js'),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);
const suite=sandbox.ThermabotAISuite;
const data={projects:[{id:'p1',name:'TMO',system:'HEPA / UTA',status:'Activo',priority:'Alta',progress:80,nextDueDate:'2026-10-01',updatedAt:'v1'},{id:'p2',name:'Finalizado parcial',status:'Finalizado',progress:55}],documents:[{projectId:'p1',title:'Pliego',driveUrl:'https://docs.google.com/document/d/test'}]};
test('portfolio flags overdue and inconsistencies',()=>{const x=suite.analyze(data,'2026-10-11');assert.equal(x.counts.overdue,1);assert.equal(x.counts.inconsistent,1);assert.equal(x.queue[0].id,'p1');});
test('proposal previews only permitted fields without mutation',()=>{const x=suite.proposedChange(data,'p1',{progress:90,nextDueDate:'2026-11-15'});assert.equal(x.ok,true);assert.equal(x.proposal.applied,false);assert.equal(data.projects[0].progress,80);assert.equal(x.proposal.changes.length,2);});
test('reject dangerous fields and invalid dates',()=>{assert.equal(suite.proposedChange(data,'p1',{installedTR:99}).ok,false);assert.equal(suite.proposedChange(data,'p1',{nextDueDate:'tomorrow'}).ok,false);assert.equal(suite.proposedChange(data,'p1',{progress:130}).ok,false);});
test('documents and HVAC audit',()=>{assert.equal(suite.linkedDocs(data,'p1').length,1);assert.equal(suite.technicalChecklist(data,'p1').scope,'HVAC / termomecánica');});
