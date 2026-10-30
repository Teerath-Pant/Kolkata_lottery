import { eq } from 'drizzle-orm';
import { Exec, db } from '../db';
import { appSettings } from '../db/schema';
import { audit } from './admin';

export const DEFAULT_PAYEE = 'Lucky Ticket Draw';
export const UPI_ID_RE = /^[\w.-]+@[\w.-]+$/;

/** Add-money QR target. upiId null = add money is off. */
export interface UpiSettings { upiId: string | null; payeeName: string }

export async function getUpi(): Promise<UpiSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'upi'));
  const v = (row?.value ?? {}) as Partial<UpiSettings>;
  return { upiId: v.upiId || null, payeeName: v.payeeName || DEFAULT_PAYEE };
}

/** Empty upiId switches add money off. */
export async function setUpi(adminId: number, input: { upiId: string | null; payeeName: string }, ip?: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(appSettings).where(eq(appSettings.key, 'upi')).for('update');
    const value: UpiSettings = { upiId: input.upiId, payeeName: input.payeeName };
    await tx.insert(appSettings).values({ key: 'upi', value, updatedBy: adminId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date(), updatedBy: adminId } });
    await audit(tx, adminId, 'upi_update', null, { before: before?.value ?? null, after: value }, ip);
    return value;
  });
}

/**
 * Bulk-buy bonus plan: a player who books `tickets` tickets in one purchase gets `bonus` coins once.
 * The player app lets one purchase hold at most 10 tickets, so the plan's quantity stops there.
 */
export interface BulkPlan { enabled: boolean; tickets: number; bonus: number }
export const BULK_TICKETS_MIN = 2;
export const BULK_TICKETS_MAX = 10;
export const DEFAULT_BULK_PLAN: BulkPlan = { enabled: true, tickets: 10, bonus: 10 };

export async function getBulkPlan(exec: Exec = db): Promise<BulkPlan> {
  const [row] = await exec.select().from(appSettings).where(eq(appSettings.key, 'bulk_plan'));
  return { ...DEFAULT_BULK_PLAN, ...((row?.value ?? {}) as Partial<BulkPlan>) };
}

export async function setBulkPlan(adminId: number, plan: BulkPlan, ip?: string) {
  return db.transaction(async (tx) => {
    const before = await getBulkPlan(tx);
    await tx.insert(appSettings).values({ key: 'bulk_plan', value: plan, updatedBy: adminId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: plan, updatedAt: new Date(), updatedBy: adminId } });
    await audit(tx, adminId, 'bulk_plan_update', null, { before, after: plan }, ip);
    return plan;
  });
}
