import type { Category } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { goalBalanceBlock } from '../src/modules/goals/application/goal-messages.js';
import { goalPeriodRange } from '../src/modules/goals/application/goal-period.js';
import { parseSpendingGoalCommand } from '../src/modules/goals/application/spending-goal-command.js';
import { resolveGoalCategory } from '../src/modules/goals/application/spending-goals.app-service.js';
import {
  replyExpenseRegistered,
  replyHelp,
} from '../src/modules/whatsapp/presentation/bot-replies.js';

function cat(name: string, kind: Category['kind'] = 'EXPENSE'): Category {
  const now = new Date();
  return {
    id: `id-${name}`,
    userId: null,
    name,
    normalizedName: name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase(),
    kind,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
  };
}

const CATS = [cat('Transporte'), cat('Mercado'), cat('Alimentação'), cat('Salário', 'INCOME')];

describe('parseSpendingGoalCommand', () => {
  it('define meta geral semanal (exemplo do usuário)', () => {
    const c = parseSpendingGoalCommand('meta gasto semanal 300,00');
    expect(c).toMatchObject({ kind: 'SET', period: 'WEEKLY', categoryHint: null });
    if (c.kind === 'SET') expect(c.amount.toString()).toBe('300');
  });

  it('aceita variações de escrita e valor', () => {
    for (const text of [
      'meta semanal 300',
      'Meta de gastos semanal R$ 300',
      'definir meta semanal de 300 reais',
      'meta de 300 por semana',
      'orçamento semanal 300',
      'limite de gastos semanal 300',
    ]) {
      const c = parseSpendingGoalCommand(text);
      expect(c, text).toMatchObject({ kind: 'SET', period: 'WEEKLY', categoryHint: null });
      if (c.kind === 'SET') expect(c.amount.toString(), text).toBe('300');
    }
  });

  it('entende período diário e mensal, e milhar com ponto', () => {
    expect(parseSpendingGoalCommand('meta diária 50')).toMatchObject({ period: 'DAILY' });
    const m = parseSpendingGoalCommand('meta mensal 1.500,50');
    expect(m).toMatchObject({ kind: 'SET', period: 'MONTHLY' });
    if (m.kind === 'SET') expect(m.amount.toString()).toBe('1500.5');
  });

  it('período ausente vira null (serviço assume mensal)', () => {
    expect(parseSpendingGoalCommand('meta 800')).toMatchObject({ kind: 'SET', period: null });
  });

  it('extrai categoria', () => {
    expect(parseSpendingGoalCommand('meta semanal transporte 200')).toMatchObject({
      kind: 'SET',
      period: 'WEEKLY',
      categoryHint: 'transporte',
    });
    expect(parseSpendingGoalCommand('meta mensal de mercado 800,00')).toMatchObject({
      categoryHint: 'mercado',
      period: 'MONTHLY',
    });
    expect(parseSpendingGoalCommand('meta geral mensal 2000')).toMatchObject({
      categoryHint: null,
    });
  });

  it('lista metas', () => {
    for (const text of ['metas', 'minhas metas', 'saldo das metas', 'ver metas', 'meta']) {
      expect(parseSpendingGoalCommand(text), text).toEqual({ kind: 'LIST' });
    }
  });

  it('remove metas', () => {
    expect(parseSpendingGoalCommand('apagar meta semanal')).toEqual({
      kind: 'REMOVE',
      period: 'WEEKLY',
      categoryHint: null,
    });
    expect(parseSpendingGoalCommand('remover a meta de mercado')).toEqual({
      kind: 'REMOVE',
      period: null,
      categoryHint: 'mercado',
    });
    expect(parseSpendingGoalCommand('apagar todas as metas')).toEqual({ kind: 'REMOVE_ALL' });
  });

  it('não captura lançamentos nem outros comandos', () => {
    for (const text of [
      '20,00 uber',
      'gastei 50 no mercado',
      'recebi 1200',
      'apaga o último lançamento',
      'amanhã às 14h reunião',
      'resumo',
      'paguei a meta do time 50',
    ]) {
      expect(parseSpendingGoalCommand(text), text).toEqual({ kind: 'NONE' });
    }
  });
});

describe('resolveGoalCategory', () => {
  it('geral quando não há dica', () => {
    expect(resolveGoalCategory(null, CATS)).toEqual({ kind: 'OVERALL' });
  });

  it('casa nome, sem acento e palavra-chave do dicionário', () => {
    expect(resolveGoalCategory('transporte', CATS)).toMatchObject({
      category: { name: 'Transporte' },
    });
    expect(resolveGoalCategory('alimentacao', CATS)).toMatchObject({
      category: { name: 'Alimentação' },
    });
    expect(resolveGoalCategory('uber', CATS)).toMatchObject({ category: { name: 'Transporte' } });
  });

  it('ignora categorias de receita e desconhecidas', () => {
    expect(resolveGoalCategory('salario', CATS)).toEqual({ kind: 'NOT_FOUND' });
    expect(resolveGoalCategory('xpto', CATS)).toEqual({ kind: 'NOT_FOUND' });
  });
});

describe('goalPeriodRange', () => {
  const tz = 'America/Sao_Paulo';
  // Domingo 27/09/2026 23:30 em São Paulo (02:30Z de segunda).
  const ref = new Date('2026-09-28T02:30:00Z');

  it('semana começa na segunda, no fuso do usuário', () => {
    const r = goalPeriodRange(ref, tz, 'WEEKLY');
    expect(r.start.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    expect(r.endExclusive.toISOString()).toBe('2026-09-28T03:00:00.000Z');
    expect(r.label).toBe('21/09 a 27/09');
  });

  it('dia e mês locais', () => {
    expect(goalPeriodRange(ref, tz, 'DAILY').start.toISOString()).toBe('2026-09-27T03:00:00.000Z');
    const m = goalPeriodRange(ref, tz, 'MONTHLY');
    expect(m.start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(m.endExclusive.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(m.label).toBe('setembro');
  });
});

describe('mensagens de meta', () => {
  const base = { scopeLabel: 'Geral', period: 'WEEKLY' as const, rangeLabel: '21/09 a 27/09' };

  it('gasto mostra saldo restante da meta', () => {
    const lines = goalBalanceBlock([
      { ...base, amount: new Decimal(300), spent: new Decimal(20), remaining: new Decimal(280) },
    ]);
    const msg = replyExpenseRegistered(new Decimal(20), 'uber', 'Transporte', 'Hoje', lines);
    expect(msg).toContain('Meta semanal · Geral');
    expect(msg).toMatch(/Saldo: R\$\s280,00 de R\$\s300,00/u);
  });

  it('avisa quando estoura ou está perto do limite', () => {
    const over = goalBalanceBlock([
      { ...base, amount: new Decimal(300), spent: new Decimal(320), remaining: new Decimal(-20) },
    ]).join('\n');
    expect(over).toMatch(/estourada em R\$\s20,00/u);
    const near = goalBalanceBlock([
      { ...base, amount: new Decimal(300), spent: new Decimal(250), remaining: new Decimal(50) },
    ]).join('\n');
    expect(near).toContain('20% ou menos');
  });
});

describe('ajuda', () => {
  it('explica como usar e como funcionam as metas', () => {
    const msg = replyHelp();
    expect(msg).toContain('*Metas de gasto*');
    expect(msg).toContain('_Como usar_');
    expect(msg).toContain('_Como funciona_');
    expect(msg).toContain('meta semanal 300');
    expect(msg).toContain('apagar todas as metas');
  });
});
