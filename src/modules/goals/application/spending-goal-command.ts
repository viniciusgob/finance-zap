import { Decimal } from 'decimal.js';
import type { GoalPeriod } from '../../../shared/types/prisma-enums.js';
import { normalizeForMatch } from '../../../shared/utils/normalize-text.js';

export type SpendingGoalCommand =
  | { kind: 'NONE' }
  | { kind: 'LIST' }
  | {
      kind: 'SET';
      amount: Decimal;
      period: GoalPeriod | null;
      /** Texto livre da categoria; null = meta geral. */
      categoryHint: string | null;
    }
  | { kind: 'REMOVE'; period: GoalPeriod | null; categoryHint: string | null }
  | { kind: 'REMOVE_ALL' };

const GOAL_NOUN = String.raw`(?:metas?|orcamentos?|limites?\s+de\s+(?:gastos?|despesas?))`;

const LEAD_WORDS = String.raw`(?:(?:definir|define|defina|criar|cria|crie|colocar|coloca|coloque|nova|novo|minha|minhas|meu|meus|ver|mostrar|mostra|listar|lista|quais|qual|as|a|o|os|saldo|saldos|de|da|das|do|dos)\s+)*`;

const REMOVE_VERBS = String.raw`(?:apagar|apaga|apague|remover|remove|remova|excluir|exclui|exclua|cancelar|cancela|cancele|tirar|tira|tire|zerar|zera|deletar|deleta)`;

const GOAL_TRIGGER_RE = new RegExp(String.raw`^${LEAD_WORDS}${GOAL_NOUN}\b`, 'u');
const REMOVE_RE = new RegExp(
  String.raw`^${REMOVE_VERBS}\s+(?:(?:a|as|o|os|minha|minhas|meu|meus|todas?|todos?)\s+)*${GOAL_NOUN}\b`,
  'u',
);

const MONEY_RE =
  /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)(?:\s*(?:reais|real))?/gu;

const STOPWORDS = new Set([
  'meta',
  'metas',
  'orcamento',
  'orcamentos',
  'limite',
  'limites',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'para',
  'pra',
  'com',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'o',
  'a',
  'os',
  'as',
  'e',
  'meu',
  'minha',
  'meus',
  'minhas',
  'por',
  'ao',
  'gasto',
  'gastos',
  'despesa',
  'despesas',
  'valor',
  'r$',
  'reais',
  'real',
  'saldo',
  'saldos',
  'categoria',
  'todas',
  'todos',
  'toda',
  'todo',
  'ver',
  'definir',
  'define',
  'defina',
  'criar',
  'cria',
  'crie',
  'colocar',
  'coloca',
  'coloque',
  'nova',
  'novo',
  'mostrar',
  'mostra',
  'listar',
  'lista',
  'quais',
  'qual',
  'apagar',
  'apaga',
  'apague',
  'remover',
  'remove',
  'remova',
  'excluir',
  'exclui',
  'exclua',
  'cancelar',
  'cancela',
  'cancele',
  'tirar',
  'tira',
  'tire',
  'zerar',
  'zera',
  'deletar',
  'deleta',
]);

const OVERALL_WORDS = new Set(['geral', 'total', 'tudo', 'global']);

const PERIOD_PATTERNS: { period: GoalPeriod; re: RegExp }[] = [
  { period: 'DAILY', re: /\b(diari[oa]s?|diariamente|por dia|ao dia|dia)\b/u },
  { period: 'WEEKLY', re: /\b(semanal|semanais|semanalmente|semana|por semana)\b/u },
  { period: 'MONTHLY', re: /\b(mensal|mensais|mensalmente|mes|por mes|ao mes)\b/u },
];

const PERIOD_WORDS_RE =
  /\b(diari[oa]s?|diariamente|dia|semanal|semanais|semanalmente|semana|mensal|mensais|mensalmente|mes)\b/gu;

function detectPeriod(n: string): GoalPeriod | null {
  for (const { period, re } of PERIOD_PATTERNS) {
    if (re.test(n)) return period;
  }
  return null;
}

function extractAmount(n: string): Decimal | null {
  let last: Decimal | null = null;
  for (const m of n.matchAll(MONEY_RE)) {
    const raw = m[1];
    if (!raw) continue;
    const d = new Decimal(raw.replace(/\./g, '').replace(',', '.'));
    if (d.gt(0)) last = d;
  }
  return last;
}

/** Palavras que sobram depois de tirar gatilho, verbo, período e valor: a dica de categoria. */
function extractCategoryHint(n: string): string | null {
  const stripped = n.replace(MONEY_RE, ' ').replace(PERIOD_WORDS_RE, ' ');
  const words = stripped
    .split(/\s+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}$]/gu, ''))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  if (words.length === 0) return null;
  if (words.some((w) => OVERALL_WORDS.has(w))) return null;
  return words.join(' ');
}

/**
 * Comandos de metas de gasto (pt-BR):
 * - `meta semanal 300` · `meta mensal mercado 800` · `meta de gasto diária 50`
 * - `metas` · `minhas metas` · `saldo das metas`
 * - `apagar meta semanal` · `remover meta de transporte` · `apagar todas as metas`
 */
export function parseSpendingGoalCommand(raw: string): SpendingGoalCommand {
  const n = normalizeForMatch(raw);
  if (!n || n.length > 120) return { kind: 'NONE' };

  if (REMOVE_RE.test(n)) {
    const hint = extractCategoryHint(n);
    const period = detectPeriod(n);
    if (/\b(todas|todos)\b/u.test(n) && hint === null && period === null) {
      return { kind: 'REMOVE_ALL' };
    }
    return { kind: 'REMOVE', period, categoryHint: hint };
  }

  if (!GOAL_TRIGGER_RE.test(n)) return { kind: 'NONE' };

  const amount = extractAmount(n);
  if (amount === null) return { kind: 'LIST' };

  return {
    kind: 'SET',
    amount,
    period: detectPeriod(n),
    categoryHint: extractCategoryHint(n),
  };
}
