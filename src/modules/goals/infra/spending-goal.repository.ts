import type { Category, SpendingGoal } from '@prisma/client';
import type { Decimal } from 'decimal.js';
import type { GoalPeriod } from '../../../shared/types/prisma-enums.js';
import { prisma } from '../../../shared/infra/prisma.js';

export type SpendingGoalWithCategory = SpendingGoal & { category: Category | null };

export const OVERALL_GOAL_SCOPE = 'all';

export function goalScopeKey(categoryId: string | null): string {
  return categoryId ?? OVERALL_GOAL_SCOPE;
}

export class SpendingGoalRepository {
  /** Uma meta por escopo (geral ou categoria): definir de novo substitui valor e período. */
  async upsert(
    userId: string,
    categoryId: string | null,
    period: GoalPeriod,
    amount: Decimal,
  ): Promise<SpendingGoalWithCategory> {
    const scopeKey = goalScopeKey(categoryId);
    return prisma.spendingGoal.upsert({
      where: { userId_scopeKey: { userId, scopeKey } },
      create: { userId, categoryId, scopeKey, period, amount: amount.toString() },
      update: { period, amount: amount.toString() },
      include: { category: true },
    });
  }

  async listForUser(userId: string): Promise<SpendingGoalWithCategory[]> {
    return prisma.spendingGoal.findMany({
      where: { userId },
      include: { category: true },
      // Meta geral (categoryId nulo) primeiro.
      orderBy: [{ categoryId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    });
  }

  /** Metas que um gasto afeta: a geral e a da categoria do gasto. */
  async listApplicable(
    userId: string,
    categoryId: string | null,
  ): Promise<SpendingGoalWithCategory[]> {
    const scopes = categoryId ? [OVERALL_GOAL_SCOPE, categoryId] : [OVERALL_GOAL_SCOPE];
    return prisma.spendingGoal.findMany({
      where: { userId, scopeKey: { in: scopes } },
      include: { category: true },
    });
  }

  async deleteByIds(userId: string, ids: string[]): Promise<number> {
    const r = await prisma.spendingGoal.deleteMany({ where: { userId, id: { in: ids } } });
    return r.count;
  }

  async deleteAllForUser(userId: string): Promise<number> {
    const r = await prisma.spendingGoal.deleteMany({ where: { userId } });
    return r.count;
  }
}
