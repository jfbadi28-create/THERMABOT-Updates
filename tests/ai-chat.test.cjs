const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync('functions/api/ai-chat.js', 'utf8')
  .replace('export function onRequestGet', 'function onRequestGet')
  .replace('export async function onRequestPost', 'async function onRequestPost');

function setup(fakeFetch) {
  const sandbox = { Response, fetch: fakeFetch };
  vm.runInNewContext(source + '\nthis.handlers = { onRequestGet, onRequestPost };', sandbox);
  return sandbox.handlers;
}

function ctx(env, body) {
  return { env, request: { json: async () => body } };
}

test('Connection check never exposes the API key', async () => {
  const { onRequestGet } = setup(() => { throw Error('No upstream call expected'); });
  const missing = await onRequestGet(ctx({}, {}));
  assert.equal((await missing.json()).configured, false);
  const present = await onRequestGet(ctx({ OPENAI_API_KEY: 'secret-value' }, {}));
  const raw = await present.text();
  assert.equal(JSON.parse(raw).configured, true);
  assert.equal(raw.includes('secret-value'), false);
});

test('Missing key returns 503 with a clear explanation', async () => {
  const { onRequestPost } = setup(() => { throw Error('No upstream call expected'); });
  const response = await onRequestPost(ctx({}, { message: 'Hola' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'MISSING_API_KEY');
});

test('OpenAI response is extracted correctly', async () => {
  let request;
  const { onRequestPost } = setup(async (_url, args) => {
    request = JSON.parse(args.body);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'Respuesta técnica.' }] }] }), { status: 200 });
  });
  const response = await onRequestPost(ctx({ OPENAI_API_KEY: 'test' }, {
    message: 'Analizá el proyecto', history: [{ role: 'assistant', content: 'Hola' }],
    context: { project: { name: 'TMO' } }
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reply, 'Respuesta técnica.');
  assert.equal(request.input.length, 2);
  assert.match(request.input[1].content, /TMO/);
});

test('OpenAI quota failure returns an actionable code', async () => {
  const { onRequestPost } = setup(async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 429 }));
  const response = await onRequestPost(ctx({ OPENAI_API_KEY: 'test' }, { message: 'Hola' }));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, 'OPENAI_QUOTA');
});
