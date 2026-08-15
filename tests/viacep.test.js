import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAddressByPostalCode } from '../services/viacep-service.js';

test('fetchAddressByPostalCode normaliza endereço pelo CEP', async () => {
  const result = await fetchAddressByPostalCode('87300-000', {
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          cep: '87300-000',
          logradouro: 'Rua Ângelo Amaral',
          bairro: 'Jardim Joana D Arc',
          localidade: 'Campo Mourão',
          uf: 'PR',
          ibge: '4104303'
        };
      }
    })
  });

  assert.equal(result.postalCode, '87300000');
  assert.equal(result.address, 'Rua Ângelo Amaral');
  assert.equal(result.province, 'Jardim Joana D Arc');
  assert.equal(result.cityName, 'Campo Mourão');
  assert.equal(result.state, 'PR');
  assert.equal(result.cityCode, 4104303);
});

test('fetchAddressByPostalCode rejeita CEP inexistente', async () => {
  await assert.rejects(
    () => fetchAddressByPostalCode('00000000', {
      fetchImpl: async () => ({
        ok: true,
        async json() {
          return { erro: true };
        }
      })
    }),
    /CEP não encontrado/i
  );
});
