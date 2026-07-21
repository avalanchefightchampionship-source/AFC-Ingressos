import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminSessionCookie,
  getLoginAttemptState,
  isAdminPasswordValid,
  registerLoginAttempt,
  resetLoginAttempts,
  verifyAdminSessionCookie,
  hashAdminPassword
} from '../lib/admin-auth.js';

test('cookie assinado valida sessão administrativa e expira corretamente', () => {
  const secret = 'test-session-secret';
  const cookie = createAdminSessionCookie({ sub: 'admin' }, { secret, expiresInMs: 60_000 });
  const payload = verifyAdminSessionCookie(cookie, { secret });

  assert.equal(payload.sub, 'admin');
  assert.equal(payload.type, 'admin');
  assert.ok(payload.exp > Date.now());
});

test('senha é validada de forma segura contra hash bcrypt', async () => {
  const hash = await hashAdminPassword('hello');
  assert.equal(await isAdminPasswordValid('hello', hash), true);
  assert.equal(await isAdminPasswordValid('world', hash), false);
});

test('bloqueia login após 5 tentativas consecutivas e limpa o contador após reset', () => {
  const key = 'test-brute-force';
  resetLoginAttempts(key);

  for (let index = 0; index < 4; index += 1) {
    const state = registerLoginAttempt(key);
    assert.equal(state.blocked, false);
  }

  const blockedState = registerLoginAttempt(key);
  assert.equal(blockedState.blocked, true);
  assert.equal(blockedState.count, 5);

  resetLoginAttempts(key);
  assert.deepEqual(getLoginAttemptState(key), { count: 0, expiresAt: 0, blocked: false });
});
