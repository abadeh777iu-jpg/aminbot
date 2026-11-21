import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function setup() {
  const store = new Map(), calls = [];
  const env = { BOT_TOKEN: 'test', ADMIN_ID: '99', WEBHOOK_SECRET: 'secret', CONVERSATIONS: {
    get: async key => store.get(key), put: async (key, value) => store.set(key, value),
  } };
  globalThis.fetch = async (url, options) => {
    calls.push({ method: url.split('/').at(-1), body: JSON.parse(options.body) });
    return Response.json({ ok: true, result: { message_id: 100 + calls.length } });
  };
  const send = (message, secret = 'secret') => worker.fetch(new Request('https://example.com/', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify({ message }),
  }), env);
  return { calls, store, send };
}
test('rejects unauthorized webhook requests', async () => {
  const { send, calls } = setup();
  assert.equal((await send({}, 'wrong')).status, 401);
  assert.equal(calls.length, 0);
});
test('welcome explains what Amin sees', async () => {
  const { send, calls } = setup();
  await send({ from: { id: 1 }, chat: { type: 'private' }, text: '/start' });
  assert.match(calls[0].body.text, /شناسه عددی/);
});
test('routes messages and replies to the correct user', async () => {
  const { send, calls, store } = setup();
  await send({ message_id: 7, from: { id: 42, first_name: 'Ali', username: 'ali' }, chat: { type: 'private' }, text: 'hello' });
  assert.match(calls[0].body.text, /@ali/);
  assert.equal(store.get('admin:101'), '42');
  assert.equal(store.get('admin:102'), '42');
  await send({ message_id: 8, from: { id: 99 }, chat: { type: 'private' }, reply_to_message: { message_id: 102 }, text: 'hi' });
  assert.equal(calls[2].method, 'copyMessage');
  assert.equal(calls[2].body.chat_id, '42');
});
test('admin replies without a mapped message are not sent to a user', async () => {
  const { send, calls } = setup();
  await send({ message_id: 9, from: { id: 99 }, chat: { type: 'private' }, text: 'hi' });
  assert.equal(calls[0].method, 'sendMessage');
  assert.equal(calls[0].body.chat_id, '99');
});
