# AFC Ingressos — Asaas Sandbox e Supabase

Landing page do Avalanche Fight Championship com pedidos registrados no Supabase antes da criação do Checkout hospedado pelo Asaas.

## Configuração local

1. Instale o Node.js 20 ou superior.
2. Execute `npm install`.
3. Instale a CLI do Supabase ou use-a com `npx supabase`.
4. Copie `.env.example` para `.env.local`.
5. Preencha em `.env.local`:
   - `ASAAS_API_KEY`: chave da conta Asaas Sandbox.
   - `ASAAS_WEBHOOK_TOKEN`: token exclusivo do Webhook Asaas, com 32 a 255 caracteres.
   - `SUPABASE_URL`: URL do projeto Supabase.
   - `SUPABASE_SERVICE_ROLE_KEY`: chave secreta `service_role`, usada apenas pelo backend.
   - `SITE_URL`: URL absoluta do site, sem caminho adicional.
6. Vincule a CLI ao projeto Supabase e aplique as migrations com `npx supabase db push`.
7. Execute `npx vercel dev` e abra `http://localhost:3000`.

Nunca coloque as chaves do Asaas ou `service_role` no `index.html` ou em qualquer código do navegador. Os arquivos `.env` e `.env.local` são ignorados pelo Git.

## Banco de dados

A migration em `supabase/migrations` recria as tabelas `pedidos`, `ingressos` e `webhook_events`, incluindo chaves, constraints, índices, defaults, timestamps e RLS. As tabelas não possuem políticas públicas: somente o backend autenticado com a chave `service_role` pode gravar nelas.

Para recriar um banco local configurado pela CLI:

```bash
npx supabase db reset
```

Para aplicar as migrations no projeto remoto vinculado:

```bash
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

## Fluxo da compra

1. O navegador envia os dados preenchidos no modal para `POST /api/criar-checkout`.
2. O backend valida e normaliza os dados e calcula o valor oficial: Arquibancada R$ 50,00 ou Cadeira VIP R$ 100,00.
3. O backend cria o pedido no Supabase com status `AGUARDANDO_PAGAMENTO` e uma `external_reference` única.
4. Somente após confirmar a gravação, o backend sincroniza o cliente e cria o Checkout Asaas usando a mesma `external_reference`.
5. O pedido recebe os identificadores do checkout e do cliente Asaas e muda para `CHECKOUT_CRIADO`.
6. O navegador recebe a URL segura e abre o Checkout Asaas.

Se a criação do checkout falhar, o pedido permanece no banco com `status_pedido = FALHA_CHECKOUT`. Sem `?ref=`, `ref_afiliado` é salvo como `null`; com `?ref=CODIGO`, o código é preservado.

## Emissão dos ingressos

Os ingressos são emitidos exclusivamente pelo webhook quando o pagamento entra em `PAGAMENTO_CONFIRMADO` ou `PAGO`. Abrir o Checkout ou retornar pela URL de sucesso não emite ingresso.

`services/payment-events.js` chama `onPaymentApproved()`, que delega a emissão para `services/ingressos-service.js`. O repositório chama a função PostgreSQL `emitir_ingressos_para_pedido` por RPC. Essa função executa tudo em uma única transação:

1. Bloqueia a linha do pedido com `FOR UPDATE`.
2. Confirma no banco que `status_pagamento` está aprovado.
3. Usa somente `quantidade` e `tipo_ingresso` armazenados no pedido.
4. Conta os ingressos existentes.
5. Cria somente os registros faltantes.
6. Confirma que a quantidade final é exatamente a quantidade comprada.
7. Atualiza `status_pedido` para `INGRESSOS_EMITIDOS`.
8. Retorna todos os ingressos do pedido.

Execuções simultâneas ficam serializadas pelo bloqueio do pedido. Uma nova execução retorna os registros existentes sem criar unidades adicionais. Se qualquer inserção falhar, a transação inteira é revertida e uma nova tentativa pode ser feita com segurança.

Cada ingresso recebe 144 bits aleatórios gerados por `pgcrypto`, apresentados como 36 caracteres hexadecimais:

```text
codigo_ingresso: AFC-CODIGO_ALEATORIO
qr_code:         AFC:1:CODIGO_ALEATORIO
```

O QR Code armazenado é somente o conteúdo curto e versionado. Não são armazenadas imagens Base64. Nome, CPF, e-mail, telefone, preço, pedido e identificadores do Asaas não aparecem no conteúdo. A próxima etapa poderá gerar a imagem do QR Code e o PDF usando `qr_code`, sem alterar o identificador.

Status preparados para ingressos:

- `VALIDO`
- `UTILIZADO`
- `CANCELADO`
- `ESTORNADO`
- `INVALIDADO`

Estornos, cancelamentos e chargebacks nunca excluem ingressos. A invalidação automática desses registros deverá ser implementada em uma etapa posterior usando os status já preparados.

PDF, e-mail, painel e check-in ainda não estão implementados.

## Teste temporário de e-mail

O endpoint `POST /api/testar-email` é temporário e foi criado apenas para validar o envio profissional de ingressos antes de conectar o fluxo ao webhook de pagamento. Ele exige o header `x-afc-test-token` com o valor definido em `EMAIL_TEST_TOKEN` e será removido após a integração definitiva.

O teste agora gera um cenário simulando dois ingressos com dados do comprador, evento e QR Code real. O payload aceito é:

```json
{
  "email": "destinatario@exemplo.com",
  "nome": "Nome do comprador"
}
```

Em caso de sucesso, a resposta retorna:

```json
{
  "success": true,
  "emailId": "id-do-envio",
  "quantidadeIngressos": 2
}
```

O fluxo não grava ingressos no Supabase, não altera pedidos reais e não chama o webhook. Ele apenas valida:

- e-mail profissional com identidade AFC;
- QR Code gerado a partir do conteúdo real do ingresso;
- PDF anexado com todos os ingressos;
- múltiplos cartões no corpo do e-mail.

## Webhook Asaas

Configure no Asaas o endpoint público `https://SEU-DOMINIO/api/webhook-asaas` e use exatamente o mesmo valor de `ASAAS_WEBHOOK_TOKEN` como token de autenticação. Não reutilize `ASAAS_API_KEY` como token do webhook.

O endpoint aceita apenas `POST` autenticado pelo header `asaas-access-token`. Cada evento é salvo em `webhook_events` antes do processamento e o `event_id` único impede efeitos duplicados. Os campos `processing` e `processed` fazem uma reserva atômica: entregas simultâneas não processam juntas, enquanto um evento salvo que falhou pode ser retomado. O pedido é localizado primeiro por `payment.externalReference` e, como alternativa, por `payment.id` já registrado.

Eventos preparados:

- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`
- `PAYMENT_RESTORED`
- `PAYMENT_RECEIVED_IN_CASH_UNDONE`
- `PAYMENT_CHARGEBACK_REQUESTED`
- `PAYMENT_CHARGEBACK_DISPUTE`
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`
- `PAYMENT_DUNNING_REQUESTED`

`onPaymentApproved()` emite os registros de ingresso e seus conteúdos individuais de QR Code. Ela ainda não gera imagem, PDF nem envia e-mail.

Execute os testes simulados com:

```bash
npm test
```
