import assert from 'node:assert/strict';
import test from 'node:test';
import { PEDIDO_SELECT } from '../repositories/pedidos-repository.js';

test('select do pedido inclui nome, email e campos de transmissão Pay-Per-View', async () => {
  assert.match(PEDIDO_SELECT, /\bnome\b/);
  assert.match(PEDIDO_SELECT, /\bemail\b/);
  assert.match(PEDIDO_SELECT, /\btelefone\b/);
  assert.match(PEDIDO_SELECT, /\btipo_ingresso\b/);
  assert.match(PEDIDO_SELECT, /\bquantidade\b/);
  assert.match(PEDIDO_SELECT, /\bvalor_total\b/);
  assert.match(PEDIDO_SELECT, /\btransmissao_link\b/);
  assert.match(PEDIDO_SELECT, /\btransmissao_enviada\b/);
  assert.match(PEDIDO_SELECT, /\btransmissao_enviada_em\b/);
  assert.match(PEDIDO_SELECT, /\btransmissao_tentativas\b/);
  assert.match(PEDIDO_SELECT, /\btransmissao_ultimo_erro\b/);
});