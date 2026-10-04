import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,onRequest} from '../functions/api/workspace-sync.js';
test('Sin credenciales Google no aparenta conexión',async()=>{const r=await onRequest({env:{},request:new Request('https://example.com/api/workspace-sync')});assert.equal(r.status,503);});
test('Bloquea escrituras de otro origen antes de acceder a Google',async()=>{const r=await onRequest({env:{THERMABOT_DRIVE_MASTER_ID:'test',THERMABOT_DRIVE_BACKUP_ID:'test',GOOGLE_SERVICE_ACCOUNT_EMAIL:'test',GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'test'},request:new Request('https://example.com/api/workspace-sync',{method:'PUT',headers:{Origin:'https://other.example','X-THERMABOT-Save':'1'}})});assert.equal(r.status,403);});
test('Rechaza contaminación de prototipos dentro del JSON serializado',()=>{assert.throws(()=>validate({format:'thermabot-cloud-v1',revision:'x',values:{'thermabot.tracker.v1':'{"__proto__":{"polluted":true}}'}}));});
test('Rechaza almacenamiento de claves o sesiones en la base',()=>{assert.throws(()=>validate({format:'thermabot-cloud-v1',revision:'x',values:{'password':'secret'}}));});
test('Admite cálculos y cartera sin convertir su modelo',()=>{const value={format:'thermabot-cloud-v1',revision:'x',values:{'thermabot.tracker.v1':'{"projects":[]}','thermabot-building-v21-trial':'{"version":3,"rooms":[]}'}};assert.equal(validate(value),value);});
