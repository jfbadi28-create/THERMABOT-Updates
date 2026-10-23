import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMaster, processRpc, tools } from '../functions/mcp-core.mjs';
const data = { projects: [{ id:'demo1', name:'Proyecto piloto' }], documents: [], milestones: [], equipment: [] };
const load = async () => normalizeMaster(data, 'test-file');
test('interpreta fuente Drive', () => {
 assert.equal(normalizeMaster(data, 'test-file').tracker.projects.length, 1);
 assert.equal(normalizeMaster({format:'thermabot-cloud-v1',revision:'r1',values:{'thermabot.tracker.v1':JSON.stringify(data)}},'test-file').source.revision,'r1');
});
test('expone solamente las cuatro consultas', async () => {
 assert.equal(tools.length,4);
 const r=await processRpc({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'thermabot_status',arguments:{}}},load);
 assert.equal(JSON.parse(r.result.content[0].text).counts.projects,1);
 const invalid=await processRpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'thermabot_delete_project',arguments:{projectId:'demo1'}}},load);
 assert.equal(invalid.error.code,-32602);
});
