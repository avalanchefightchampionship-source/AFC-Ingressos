import assert from 'node:assert/strict';
import test from 'node:test';
import { PEDIDO_SELECT } from '../repositories/pedidos-repository.js';

test('select do pedido inclui nome e email para reuso no envio de e-mail', async () => {
  assert.match(PEDIDO_SELECT, /\bnome\b/);
  assert.match(PEDIDO_SELECT, /\bemail\b/);
});