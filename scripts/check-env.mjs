import fs from 'node:fs';

const file = process.argv[2] || '.env.local';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

const get = (key) => {
  const line = lines.find((entry) => entry.startsWith(`${key}=`));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/^"|"$/g, '');
};

const PLACEHOLDER = '[SENSITIVE]';

const checks = [
  ['ASAAS_API_KEY', (v) => v.length > 20 && v !== PLACEHOLDER],
  ['SUPABASE_URL', (v) => /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v) && v !== PLACEHOLDER],
  ['SUPABASE_SERVICE_ROLE_KEY', (v) => v.startsWith('eyJ') && v.length > 100 && v !== PLACEHOLDER],
  ['SITE_URL', (v) => /^https?:\/\//.test(v) && v !== PLACEHOLDER]
];

let ok = true;
let hasSensitivePlaceholder = false;
console.log(`Arquivo: ${file}`);
for (const [key, validate] of checks) {
  const value = get(key);
  const valid = validate(value);
  if (!valid) ok = false;
  if (value === PLACEHOLDER) hasSensitivePlaceholder = true;
  const hint =
    value === PLACEHOLDER
      ? ' (placeholder da Vercel — variável marcada como Sensitive em Production)'
      : value.length === 0
        ? ' (ausente)'
        : '';
  console.log(`${valid ? 'OK' : 'FALHA'} ${key}${hint}`);
}

if (hasSensitivePlaceholder) {
  console.log(`
Nota: variáveis Sensitive de Production não podem ser baixadas com vercel env pull.
Para testar localmente, preencha .env.local manualmente ou cadastre cópias no ambiente Development na Vercel.
Veja: scripts/setup-local-env.mjs (comentário no final) ou README.
`);
}

process.exitCode = ok ? 0 : 1;
