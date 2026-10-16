const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const legacy = fs.readFileSync('api/ai-chat.js', 'utf8');
const frontend = fs.readFileSync('thermabot-ai.js', 'utf8');

function handlerWithBlockedNetwork() {
  let outboundCalls = 0;
  const sandbox = {
    module: { exports: {} },
    fetch() { outboundCalls++; throw Error('Legacy API must not make outbound requests'); },
    process: { env: { OPENAI_API_KEY: 'test-key-must-never-be-used' } }
  };
  const commonJs = legacy.replace('export default function handler', 'function handler');
  assert.notEqual(commonJs, legacy, 'Legacy endpoint must keep its exported handler');
  vm.runInNewContext(commonJs + '\nmodule.exports = handler;', sandbox);
  return { handler: sandbox.module.exports, calls: () => outboundCalls };
}

function mockResponse() {
  return {
    code: 200, headers: {}, payload: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    status(code) { this.code = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

for (const method of ['POST', 'GET', 'OPTIONS', 'PUT']) {
  test('Vercel legacy AI rejects ' + method + ' without billing OpenAI', async () => {
    const server = handlerWithBlockedNetwork();
    const res = mockResponse();
    await server.handler({ method, headers: { origin: 'https://jfbadi28-create.github.io' }, body: { message: 'Hola' } }, res);
    assert.equal(res.code, 410);
    assert.equal(res.payload.ok, false);
    assert.equal(res.payload.code, 'LEGACY_AI_DISABLED');
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    assert.equal(server.calls(), 0);
  });
}

test('Browser AI sends no project data to the legacy Vercel URL', () => {
  assert.equal(frontend.includes('thermabot-ai-backend.vercel.app'), false);
  assert.match(frontend, /const API_URL=new URL\('\/api\/ai-chat',location\.origin\)\.href/);
  assert.match(frontend, /if\(ON_GITHUB_PAGES\)throw new Error/);
});
