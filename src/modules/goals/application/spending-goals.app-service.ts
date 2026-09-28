import type { Category } from '@prisma/client';
import { Decimal } from 'decimal.js';
import type { Logger } from 'pino';
import { GoalPeriod } from '../../../shared/types/prisma-enums.js';
import { normalizeForMatch } from '../../../shared/utils/normalize-text.js';
import type { CategoryRepository } from '../../categories/infra/category.repository.js';
import { KEYWORD_TO_CATEGORY_NAME } from '../../parser/application/category-dictionary.js';
import type { TransactionRepository } from '../../transactions/infra/transaction.repository.js';
import type {
  SpendingGoalRepository,
  SpendingGoalWithCategory,
} from '../infra/spending-goal.repository.js';
import * as Msg from './goal-messages.js';
import { goalPeriodRange } from './goal-period.js';
import { parseSpendingGoalCommand, type SpendingGoalCommand } from './spending-goal-command.js';

const OVERALL_LABEL = 'Geral';

type CategoryResolution =
  | { kind: 'OVERALL' }
  | { kind: 'FOUND'; category: Category }
  | { kind: 'NOT_FOUND' };

function expenseCategories(cats: Category[]): Category[] {
  return cats.filter((c) => c.kind === 'EXPENSE' || c.kind === 'BOTH');
}

/** Casa a dica ("mercado", "uber", "transporte") com uma categoria de gasto. */
export function resolveGoalCategory(hint: string | null, cats: Category[]): CategoryResolution {
  if (hint === null) return { kind: 'OVERALL' };
  const h = normalizeForMatch(hint);
  const candidates = expenseCategories(cats);
  const exact = candidates.find((c) => c.normalizedName === h);
  if (exact) return { kind: 'FOUND', category: exact };
  const partial = candidates.find(
    (c) => h.includes(c.normalizedName) || c.normalizedName.includes(h),
  );
  if (partial) return { kind: 'FOUND', category: partial };
  for (const word of h.split(' ')) {
    const mapped = KEYWORD_TO_CATEGORY_NAME[word];
    if (!mapped) continue;
    const byKeyword = candidates.find((c) => c.normalizedName === normalizeForMatch(mapped));
    if (byKeyword) return { kind: 'FOUND', category: byKeyword };
  }
  return { kind: 'NOT_FOUND' };
}

export class SpendingGoalsAppService {
  constructor(
    private readonly goals: SpendingGoalRepository,
    private readonly transactions: TransactionRepository,
    private readonly categories: CategoryRepository,
    private readonly log?: Logger,
  ) {}

  parseCommand(raw: string): SpendingGoalCommand {
    return parseSpendingGoalCommand(raw);
  }

  async handleInbound(
    userId: string,
    raw: string,
    tz: string,
    now: Date,
  ): Promise<{ handled: boolean; message: string }> {
    const cmd = this.parseCommand(raw);
    if (cmd.kind === 'NONE') return { handled: false, message: '' };

    try {
      switch (cmd.kind) {
        case 'LIST': {
          const goals = await this.goals.listForUser(userId);
          const views = await Promise.all(goals.map((g) => this.statusOf(g, userId, tz, now)));
          return { handled: true, message: Msg.replyGoalsList(views) };
        }
        case 'SET': {
          const cats = await this.categories.listForUser(userId);
          const resolved = resolveGoalCategory(cmd.categoryHint, cats);
          if (resolved.kind === 'NOT_FOUND') {
            return {
              handled: true,
              message: Msg.replyGoalCategoryNotFound(
                cmd.categoryHint ?? '',
                expenseCategories(cats).map((c) => c.name),
              ),
            };
          }
          const categoryId = resolved.kind === 'FOUND' ? resolved.category.id : null;
          const period = cmd.period ?? GoalPeriod.MONTHLY;
          const goal = await this.goals.upsert(userId, categoryId, period, cmd.amount);
          const view = await this.statusOf(goal, userId, tz, now);
          return { handled: true, message: Msg.replyGoalSet(view, cmd.period === null) };
        }
        case 'REMOVE_ALL': {
          const goals = await this.goals.listForUser(userId);
          if (goals.length === 0) return { handled: true, message: Msg.replyGoalNotFound() };
          await this.goals.deleteAllForUser(userId);
          return {
            handled: true,
            message: Msg.replyGoalRemoved(goals.map((g) => this.labelOf(g))),
          };
        }
        case 'REMOVE': {
          const goals = await this.goals.listForUser(userId);
          let targets = goals;
          if (cmd.categoryHint !== null) {
            const cats = await this.categories.listForUser(userId);
            const resolved = resolveGoalCategory(cmd.categoryHint, cats);
            if (resolved.kind !== 'FOUND')
              return { handled: true, message: Msg.replyGoalNotFound() };
            targets = targets.filter((g) => g.categoryId === resolved.category.id);
          } else if (cmd.period === null) {
            // "apagar meta" sem detalhe: só remove se houver uma única meta.
            if (goals.length !== 1) {
              const views = await Promise.all(goals.map((g) => this.statusOf(g, userId, tz, now)));
              return { handled: true, message: Msg.replyGoalsList(views) };
            }
          } else {
            // "apagar meta semanal": prefere a meta geral; senão, as de categoria desse período.
            const overall = targets.filter((g) => g.categoryId === null && g.period === cmd.period);
            targets = overall.length > 0 ? overall : targets;
          }
          if (cmd.period !== null) targets = targets.filter((g) => g.period === cmd.period);
          if (targets.length === 0) return { handled: true, message: Msg.replyGoalNotFound() };
          await this.goals.deleteByIds(
            userId,
            targets.map((g) => g.id),
          );
          return {
            handled: true,
            message: Msg.replyGoalRemoved(targets.map((g) => this.labelOf(g))),
          };
        }
      }
    } catch (err: unknown) {
      if (this.log) this.log.error({ err, userId }, 'Falha ao processar meta de gasto');
      return {
        handled: true,
        message: '⚠️ *Erro*\n\nNão consegui processar a meta. Tente novamente.',
      };
    }
  }

  /**
   * Linhas de saldo das metas afetadas por um gasto (geral + categoria), no período que contém
   * `occurredAt`. Vazio quando não há metas.
   */
  async balanceLinesForExpense(
    userId: string,
    categoryId: string | null,
    occurredAt: Date,
    tz: string,
  ): Promise<string[]> {
    const goals = await this.goals.listApplicable(userId, categoryId);
    if (goals.length === 0) return [];
    // Meta geral primeiro, depois a da categoria.
    goals.sort((a, b) => Number(a.categoryId !== null) - Number(b.categoryId !== null));
    const views = await Promise.all(goals.map((g) => this.statusOf(g, userId, tz, occurredAt)));
    return Msg.goalBalanceBlock(views);
  }

  private labelOf(g: SpendingGoalWithCategory): string {
    return Msg.goalLabel({ period: g.period, scopeLabel: g.category?.name ?? OVERALL_LABEL });
  }

  private async statusOf(
    g: SpendingGoalWithCategory,
    userId: string,
    tz: string,
    reference: Date,
  ): Promise<Msg.GoalStatusView> {
    const range = goalPeriodRange(reference, tz, g.period);
    const sum = await this.transactions.sumExpenses(
      userId,
      range.start,
      range.endExclusive,
      g.categoryId ?? undefined,
    );
    const amount = new Decimal(g.amount.toString());
    const spent = new Decimal(sum?.toString() ?? '0');
    return {
      scopeLabel: g.category?.name ?? OVERALL_LABEL,
      period: g.period,
      amount,
      spent,
      remaining: amount.minus(spent),
      rangeLabel: range.label,
    };
  }
}
