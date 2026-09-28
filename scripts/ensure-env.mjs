import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const examplePath = resolve(root, '.env.example');

if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) {
    console.error('Arquivo .env.example não encontrado');
    process.exit(1);
  }
  copyFileSync(examplePath, envPath);
  console.warn(
    '[finance-zap] .env criado a partir do .env.example — revise os segredos antes de ir para produção.',
  );
}
