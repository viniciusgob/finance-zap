import { Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/application/reports.service.js';
import type { TransactionRepository } from '../src/modules/transactions/infra/transaction.repository.js';
import type { CategoryRepository } from '../src/modules/categories/infra/category.repository.js';
import { replyWeekLedger } from '../src/modules/whatsapp/presentation/bot-replies.js';
import { TransactionType } from '../src/shared/types/prisma-enums.js';

const TZ = 'America/Sao_Paulo';
// Quarta 23/09/2026 12:00 em São Paulo.
const REF = new Date('2026-09-23T15:00:00Z');

function service(overrides: Partial<Record<keyof TransactionRepository, unknown>> = {}) {
  const transactions = {
    aggregateMonth: vi.fn(async () => [
      { type: TransactionType.INCOME, _sum: { amount: new Prisma.Decimal('500') } },
      { type: TransactionType.EXPENSE, _sum: { amount: new Prisma.Decimal('120') } },
    ]),
    groupByCategoryMonth: vi.fn(async () => []),
    topExpenses: vi.fn(async () => []),
    listExpensesInRange: vi.fn(async () => []),
    ...overrides,
  } as unknown as TransactionRepository;
  const categories = { listForUser: vi.fn(async () => []) } as unknown as CategoryRepository;
  return { svc: new ReportsService(transactions, categories), transactions };
}

describe('ReportsService — semana', () => {
  it('usa a semana de segunda a domingo no fuso do usuário', async () => {
    const { svc, transactions } = service();
    const s = await svc.weeklySummary('u1', TZ, REF);
    expect(s.rangeLabel).toBe('21/09 a 27/09');
    expect(s.start.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    expect(s.endExclusive.toISOString()).toBe('2026-09-28T03:00:00.000Z');
    expect(s.balance.toString()).toBe('380');
    expect(transactions.aggregateMonth).toHaveBeenCalledWith('u1', s.start, s.endExclusive);
  });

  it('semana passada (offset 1) é a de 14/09 a 20/09', async () => {
    const { svc } = service();
    const previous = await svc.weeklySummary('u1', TZ, REF, 1);
    expect(previous.rangeLabel).toBe('14/09 a 20/09');
  });

  it('toda segunda começa uma semana nova: domingo 23:59 fica na semana anterior', async () => {
    const { svc, transactions } = service();
    // Segunda 28/09/2026 00:01 em São Paulo.
    const monday = new Date('2026-09-28T03:01:00Z');
    const s = await svc.weeklySummary('u1', TZ, monday);
    expect(s.rangeLabel).toBe('28/09 a 04/10');
    expect(s.start.toISOString()).toBe('2026-09-28T03:00:00.000Z');
    // Domingo 27/09 23:59 em SP = 02:59Z de 28/09, antes do início da semana.
    expect(new Date('2026-09-28T02:59:00Z') < s.start).toBe(true);
    expect(transactions.aggregateMonth).toHaveBeenCalledWith('u1', s.start, s.endExclusive);
  });

  it('soma gastos por dia local (gasto 23h de segunda fica na segunda)', async () => {
    const { svc } = service({
      listExpensesInRange: vi.fn(async () => [
        // Seg 21/09 23:30 em SP = 02:30Z de terça.
        { amount: new Prisma.Decimal('20'), occurredAt: new Date('2026-09-22T02:30:00Z') },
        { amount: new Prisma.Decimal('30'), occurredAt: new Date('2026-09-21T15:00:00Z') },
        { amount: new Prisma.Decimal('70'), occurredAt: new Date('2026-09-23T15:00:00Z') },
      ]),
    });
    const rows = await svc.expensesByDayWeek('u1', TZ, REF);
    expect(rows.map((r) => [r.dayLabel, r.total.toString()])).toEqual([
      ['seg 21/09', '50'],
      ['qua 23/09', '70'],
    ]);
  });
});

describe('replyWeekLedger', () => {
  const week = (expense: string, income = '0') => ({
    rangeLabel: '21/09 a 27/09',
    income: new Decimal(income),
    expense: new Decimal(expense),
    balance: new Decimal(income).minus(expense),
    start: new Date(),
    endExclusive: new Date(),
  });

  it('mostra só a semana: totais, gastos por dia e por categoria, sem citar outra semana', () => {
    const msg = replyWeekLedger(
      week('120', '500'),
      [{ categoryId: 'c1', categoryName: 'Transporte', total: new Decimal(120) }],
      [{ dayLabel: 'seg 21/09', total: new Decimal(120) }],
      [],
    );
    expect(msg).toContain('Resumo da semana');
    expect(msg).toContain('21/09 a 27/09');
    expect(msg).toMatch(/Saídas R\$\s120,00/u);
    expect(msg).toContain('seg 21/09');
    expect(msg).toContain('Transporte');
    expect(msg).not.toMatch(/semana anterior|semana passada/u);
  });

  it('semana vazia', () => {
    expect(replyWeekLedger(week('0'), [], [], [])).toContain('Nenhum lançamento nesta semana.');
  });

  it('semana passada tem título próprio', () => {
    const msg = replyWeekLedger(week('0'), [], [], [], { lastWeek: true });
    expect(msg).toContain('Resumo da semana passada');
    expect(msg).toContain('Nenhum lançamento na semana passada.');
  });
});
