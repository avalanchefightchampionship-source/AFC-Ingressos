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
import { getDashboardData } from '../api/admin/dashboard.js';

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

const createSupabaseStub = () => {
  const calls = [];

  const buildQuery = (table) => ({
    select(columns, options) {
      calls.push({ table, method: 'select', columns, options });
      const chain = {
        order(field, config) {
          calls.push({ table, method: 'order', field, config });
          return chain;
        },
        limit(value) {
          calls.push({ table, method: 'limit', value });
          return Promise.resolve({
            data: [
              { id: '1', valor_total: 100, status_pagamento: 'PAGO', email_enviado: true, email_tentativas: 1, email_ultimo_erro: null },
              { id: '2', valor_total: 200, status_pagamento: 'PAGAMENTO_CONFIRMADO', email_enviado: true, email_tentativas: 1, email_ultimo_erro: null },
              { id: '3', valor_total: 300, status_pagamento: 'AGUARDANDO_PAGAMENTO', email_enviado: false, email_tentativas: 0, email_ultimo_erro: null }
            ],
            error: null
          });
        },
        eq(field, value) {
          calls.push({ table, method: 'eq', field, value });

          if (table === 'pedidos' && field === 'status_pagamento' && value === 'AGUARDANDO_PAGAMENTO') {
            return Promise.resolve({ count: 1, error: null });
          }

          if (table === 'pedidos' && field === 'status_pagamento' && value === 'CANCELADO') {
            return Promise.resolve({ count: 0, error: null });
          }

          throw new Error(`Consulta eq inesperada: ${table}.${field}=${value}`);
        },
        in(field, values) {
          calls.push({ table, method: 'in', field, values });

          if (table === 'pedidos' && columns === '*' && field === 'status_pagamento') {
            return Promise.resolve({ count: 2, error: null });
          }

          if (table === 'pedidos' && columns === 'valor_total' && field === 'status_pagamento') {
            return Promise.resolve({
              data: [
                { valor_total: 100 },
                { valor_total: 200 }
              ],
              error: null
            });
          }

          throw new Error(`Consulta in inesperada: ${table}.${field}`);
        }
      };

      if (table === 'pedidos' && columns === '*' && options?.head && options?.count === 'exact') {
        return {
          eq: chain.eq,
          in: chain.in,
          then: (resolve) => resolve({ count: 3, error: null })
        };
      }

      if (table === 'ingressos' && columns === '*' && options?.head && options?.count === 'exact') {
        return {
          then: (resolve) => resolve({ count: 2, error: null })
        };
      }

      return chain;
    }
  });

  return {
    supabase: {
      from(table) {
        calls.push({ table, method: 'from' });
        return buildQuery(table);
      }
    },
    calls
  };
};

test('dashboard conta e soma todos os status aprovados usados pelo sistema', async () => {
  const { supabase, calls } = createSupabaseStub();

  const result = await getDashboardData(supabase);

  assert.equal(result.dashboard.totalPedidos, 3);
  assert.equal(result.dashboard.pedidosPagos, 2);
  assert.equal(result.dashboard.pedidosPendentes, 1);
  assert.equal(result.dashboard.pedidosCancelados, 0);
  assert.equal(result.dashboard.totalIngressos, 2);
  assert.equal(result.dashboard.valorTotalVendido, 300);

  const approvedFilters = calls.filter((call) => call.method === 'in' && call.field === 'status_pagamento');
  assert.equal(approvedFilters.length, 2);

  for (const filterCall of approvedFilters) {
    assert.deepEqual(filterCall.values, ['PAGAMENTO_CONFIRMADO', 'PAGO']);
  }
});
