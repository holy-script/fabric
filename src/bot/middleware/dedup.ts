import type { Context, NextFunction } from "grammy";

// Rolling set of active and recently processed update IDs
const activeUpdateIds = new Set<number>();
const completedUpdateIds = new Map<number, number>(); // update_id -> completedAt timestamp
const MAX_COMPLETED_CACHE_SIZE = 5000;
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cleanupOldUpdates() {
  const now = Date.now();
  for (const [id, timestamp] of completedUpdateIds.entries()) {
    if (now - timestamp > DEDUP_TTL_MS) {
      completedUpdateIds.delete(id);
    }
  }
}

/**
 * Deduplication middleware to prevent Telegram webhook retries from triggering duplicate executions.
 * Telegram retries webhook delivery up to 3 times if processing takes > 5 seconds.
 */
export async function deduplicateUpdates(ctx: Context, next: NextFunction) {
  const updateId = ctx.update?.update_id;
  if (updateId === undefined) {
    return next();
  }

  // If this exact update is currently in-flight, immediately acknowledge and abort duplicate execution
  if (activeUpdateIds.has(updateId)) {
    console.warn(`⚠️ [DEDUP] Dropping in-flight retry from Telegram for update_id ${updateId}`);
    return;
  }

  // If this update was already successfully processed in the last 10 minutes, drop it
  if (completedUpdateIds.has(updateId)) {
    console.warn(`⚠️ [DEDUP] Dropping already-processed retry from Telegram for update_id ${updateId}`);
    return;
  }

  // Mark as in-flight
  activeUpdateIds.add(updateId);

  try {
    await next();
  } finally {
    activeUpdateIds.delete(updateId);
    completedUpdateIds.set(updateId, Date.now());

    if (completedUpdateIds.size > MAX_COMPLETED_CACHE_SIZE) {
      cleanupOldUpdates();
    }
  }
}

