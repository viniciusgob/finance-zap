import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

dotenvConfig();

const DEFAULT_WHISPER_PROMPT_PT_BR =
  'Mensagem de voz em português do Brasil sobre gastos, receitas e compromissos. ' +
  'Gastei R$ 45,90 no mercado, paguei o Uber, recebi o Pix de mil reais. ' +
  'Amanhã às 14h reunião com a Ana.';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3009),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((u) => u.startsWith('postgresql://') || u.startsWith('postgres://'), {
      message: 'DATABASE_URL deve ser uma string de conexão PostgreSQL',
    }),
  BAILEYS_AUTH_DIR: z.string().min(1).default('./baileys_auth'),
  MEDIA_STORAGE_DIR: z.string().min(1).default('./storage/media'),
  TESSERACT_LANG: z.string().min(1).default('por'),
  WHISPER_CLI_PATH: z.string().optional(),
  WHISPER_MODEL_PATH: z.string().optional(),
  WHISPER_LANG: z.string().min(1).default('pt'),
  /** Contexto PT-BR para o whisper (grafia/vocabulário). Vazio usa o padrão; `off` desativa. */
  WHISPER_PROMPT: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .default(DEFAULT_WHISPER_PROMPT_PT_BR)
      .transform((v) => (v.trim().toLowerCase() === 'off' ? undefined : v)),
  ),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  DEFAULT_TIMEZONE: z.string().min(1).default('America/Sao_Paulo'),
  DEFAULT_LOCALE: z.string().min(1).default('pt-BR'),
  /** Hora local (0–23) para lembretes só com data, sem horário explícito. */
  REMINDER_DEFAULT_DAY_HOUR: z.coerce.number().int().min(0).max(23).default(9),
  /** Aviso antecipado padrão (minutos) para compromissos com hora. */
  REMINDER_EARLY_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(15),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Variáveis de ambiente inválidas: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
