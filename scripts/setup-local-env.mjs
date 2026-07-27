import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve('.env.local');
const vercelEnvPath = path.resolve('.vercel', '.env.production.local');

const run = (command) => {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', shell: true });
};

for (const file of [envPath, vercelEnvPath]) {
  if (fs.existsSync(file)) {
    console.log(`Removendo ${path.relative(process.cwd(), file)}...`);
    fs.unlinkSync(file);
  }
}

run('npx vercel pull --environment=production --yes');
run('npx vercel env pull .env.local --environment=production --yes');

let content = fs.readFileSync(envPath, 'utf8');
content = content.replace(/SITE_URL="[^"]*"/, 'SITE_URL="http://localhost:3000"');
fs.writeFileSync(envPath, content);
console.log('\nSITE_URL ajustado para http://localhost:3000');

console.log('\nValidando .env.local...');
let valid = true;
try {
  execSync('node scripts/check-env.mjs .env.local', { stdio: 'inherit' });
} catch {
  valid = false;
}

if (!valid) {
  console.log(`
══════════════════════════════════════════════════════════════
  Variáveis Sensitive — comportamento esperado da Vercel
══════════════════════════════════════════════════════════════

O vercel env pull baixa os NOMES das variáveis, mas chaves marcadas
como "Sensitive" em Production vêm como [SENSITIVE]. Isso NÃO é bug.

Para testar checkout localmente, escolha UMA opção:

A) Preencher .env.local manualmente (mais rápido agora)
   1. Abra .env.local no editor
   2. Substitua [SENSITIVE] pelos valores reais de:
      - SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY → painel Supabase → Settings → API
      - ASAAS_API_KEY e ASAAS_API_URL → painel Asaas
      - RESEND_API_KEY → painel Resend (se for testar e-mail)
   3. Mantenha SITE_URL="http://localhost:3000"
   4. Rode: npm run dev:local

B) Cadastrar cópias no ambiente Development na Vercel
   Settings → Environment Variables → adicionar cada chave também em "Development"
   (Development permite pull completo). Depois: npx vercel env pull .env.local

C) Pular teste local do checkout
   Publicar (migration + deploy) e testar compra real em produção —
   lá as variáveis Sensitive funcionam normalmente.

Próximo passo recomendado: opção A ou C.
`);
  process.exit(1);
}

console.log(`
Setup concluído. Próximo passo:

  npm run dev:local

Depois abra http://localhost:3000 (não Live Server).
`);
