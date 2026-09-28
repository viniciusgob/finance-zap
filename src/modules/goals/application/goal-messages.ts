import type { Decimal } from 'decimal.js';
import type { GoalPeriod } from '../../../shared/types/prisma-enums.js';
import { formatMoney } from '../../whatsapp/presentation/bot-replies.js';
import { fzSection } from '../../whatsapp/presentation/bot-voice.js';
import { goalPeriodAdjective } from './goal-period.js';

/** Situação de uma meta no período corrente. */
export interface GoalStatusView {
  /** "Geral" ou o nome da categoria. */
  scopeLabel: string;
  period: GoalPeriod;
  amount: Decimal;
  spent: Decimal;
  remaining: Decimal;
  rangeLabel: string;
}

function periodLine(v: GoalStatusView): string {
  if (v.period === 'DAILY') return `Hoje (${v.rangeLabel})`;
  if (v.period === 'WEEKLY') return `Semana de ${v.rangeLabel}`;
  return `Mês de ${v.rangeLabel}`;
}

function balanceLines(v: GoalStatusView): string[] {
  if (v.remaining.lt(0)) {
    return [
      `🚨 Meta estourada em ${formatMoney(v.remaining.abs())}`,
      `Gasto: ${formatMoney(v.spent)} de ${formatMoney(v.amount)}`,
    ];
  }
  const lines = [`💰 Saldo: ${formatMoney(v.remaining)} de ${formatMoney(v.amount)}`];
  if (v.amount.gt(0) && v.remaining.lte(v.amount.mul(0.2))) {
    lines.push('⚠️ Restam 20% ou menos da meta');
  }
  return lines;
}

/** Bloco anexado à confirmação de gasto. */
export function goalBalanceBlock(views: GoalStatusView[]): string[] {
  const lines: string[] = [];
  for (const v of views) {
    lines.push('', `🎯 *${goalLabel(v)}*`, ...balanceLines(v));
  }
  return lines;
}

export function replyGoalSet(v: GoalStatusView, periodWasDefaulted: boolean): string {
  const lines = [
    '✅ *Meta definida*',
    '',
    `🎯 ${goalLabel(v)}`,
    `💸 Limite: ${formatMoney(v.amount)}`,
    `🗓️ ${periodLine(v)}`,
    '',
    ...balanceLines(v),
  ];
  if (periodWasDefaulted) {
    lines.push('', 'Sem período informado, usei *mensal*. Ex.: meta semanal 300');
  }
  lines.push('', 'A cada gasto eu mostro o saldo da meta.');
  return lines.join('\n');
}

export function replyGoalsList(views: GoalStatusView[]): string {
  if (views.length === 0) {
    return replyGoalsEmpty();
  }
  const lines = [fzSection('🎯', 'Suas metas de gasto')];
  for (const v of views) {
    lines.push('', `*${goalLabel(v)}*`, periodLine(v), ...balanceLines(v));
  }
  lines.push('', 'Para remover: apagar meta semanal · apagar meta de mercado');
  return lines.join('\n');
}

export function replyGoalsEmpty(): string {
  return [
    fzSection('🎯', 'Metas de gasto'),
    'Nenhuma meta definida.',
    '',
    'Exemplos:',
    '',
    '• meta semanal 300',
    '• meta mensal mercado 800',
    '• meta diária transporte 40',
  ].join('\n');
}

export function replyGoalRemoved(labels: string[]): string {
  if (labels.length === 1) {
    return [fzSection('✅', 'Meta removida'), labels[0] ?? ''].join('\n');
  }
  return [fzSection('✅', 'Metas removidas'), ...labels.map((l) => `• ${l}`)].join('\n');
}

export function replyGoalNotFound(): string {
  return [
    fzSection('⚠️', 'Meta não encontrada'),
    'Envie *metas* para ver as que estão ativas.',
  ].join('\n');
}

export function replyGoalCategoryNotFound(hint: string, categoryNames: string[]): string {
  return [
    fzSection('⚠️', 'Categoria não encontrada'),
    `Não achei a categoria "${hint}". Categorias de gasto:`,
    '',
    ...categoryNames.map((c) => `• ${c}`),
    '',
    'Ex.: meta semanal transporte 200',
  ].join('\n');
}

export function goalLabel(v: Pick<GoalStatusView, 'period' | 'scopeLabel'>): string {
  return `Meta ${goalPeriodAdjective(v.period)} · ${v.scopeLabel}`;
}
