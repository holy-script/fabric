import fs from "fs";
import path from "path";
import type { TaskPlan } from "./types.js";
import { db } from "../db/firestore.js";

const DEFAULT_TASKS_DIR = path.resolve(process.cwd(), "data/tasks");

function ensureDirectoryExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Local File-based Persistence for Task Plans
 */
export async function savePlanLocal(plan: TaskPlan, baseDir: string = DEFAULT_TASKS_DIR): Promise<string> {
  ensureDirectoryExists(baseDir);
  const filePath = path.join(baseDir, `${plan.id}.json`);
  const data = JSON.stringify(plan, null, 2);
  await fs.promises.writeFile(filePath, data, "utf8");
  return filePath;
}

export async function getPlanLocal(planId: string, baseDir: string = DEFAULT_TASKS_DIR): Promise<TaskPlan | null> {
  const filePath = path.join(baseDir, `${planId}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    return JSON.parse(raw) as TaskPlan;
  } catch (err) {
    console.warn(`[TaskStore] Failed to read local plan ${planId}:`, err);
    return null;
  }
}

export async function listPlansLocal(baseDir: string = DEFAULT_TASKS_DIR): Promise<TaskPlan[]> {
  ensureDirectoryExists(baseDir);
  const files = await fs.promises.readdir(baseDir);
  const plans: TaskPlan[] = [];

  for (const file of files) {
    if (file.endsWith(".json")) {
      try {
        const raw = await fs.promises.readFile(path.join(baseDir, file), "utf8");
        const plan = JSON.parse(raw) as TaskPlan;
        if (plan.id && plan.steps) {
          plans.push(plan);
        }
      } catch (err) {
        // Skip corrupted files
      }
    }
  }

  return plans.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
}

export async function deletePlanLocal(planId: string, baseDir: string = DEFAULT_TASKS_DIR): Promise<boolean> {
  const filePath = path.join(baseDir, `${planId}.json`);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
    return true;
  }
  return false;
}

/**
 * Firestore Persistence for Task Plans
 */
const FIRESTORE_COLLECTION = "task_plans";

export async function savePlanFirestore(plan: TaskPlan): Promise<void> {
  try {
    if (!db) return;
    const docRef = db.collection(FIRESTORE_COLLECTION).doc(plan.id);
    await docRef.set({
      ...plan,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn(`[TaskStore] Firestore save failed for plan ${plan.id}:`, err?.message);
    // Non-fatal: Local file remains primary fallback
  }
}

export async function getPlanFirestore(planId: string): Promise<TaskPlan | null> {
  try {
    if (!db) return null;
    const docRef = db.collection(FIRESTORE_COLLECTION).doc(planId);
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as TaskPlan;
  } catch (err: any) {
    console.warn(`[TaskStore] Firestore read failed for plan ${planId}:`, err?.message);
    return null;
  }
}

export async function listPlansFirestore(limitCount: number = 20): Promise<TaskPlan[]> {
  try {
    if (!db) return [];
    const snap = await db.collection(FIRESTORE_COLLECTION).limit(limitCount).get();
    const plans: TaskPlan[] = [];
    snap.forEach((doc) => {
      plans.push(doc.data() as TaskPlan);
    });
    return plans;
  } catch (err: any) {
    console.warn("[TaskStore] Firestore list failed:", err?.message);
    return [];
  }
}

export async function deletePlanFirestore(planId: string): Promise<boolean> {
  try {
    if (!db) return false;
    await db.collection(FIRESTORE_COLLECTION).doc(planId).delete();
    return true;
  } catch (err: any) {
    console.warn(`[TaskStore] Firestore delete failed for plan ${planId}:`, err?.message);
    return false;
  }
}

/**
 * Unified TaskStore class coordinating local file and Firestore persistence.
 */
export class TaskStore {
  private baseDir: string;
  private syncFirestore: boolean;

  constructor(options: { baseDir?: string; syncFirestore?: boolean } = {}) {
    this.baseDir = options.baseDir || DEFAULT_TASKS_DIR;
    this.syncFirestore = options.syncFirestore ?? true;
  }

  async save(plan: TaskPlan): Promise<void> {
    await savePlanLocal(plan, this.baseDir);
    if (this.syncFirestore) {
      await savePlanFirestore(plan);
    }
  }

  async get(planId: string): Promise<TaskPlan | null> {
    // Check local store first
    const local = await getPlanLocal(planId, this.baseDir);
    if (local) return local;

    // Fall back to Firestore
    if (this.syncFirestore) {
      return await getPlanFirestore(planId);
    }
    return null;
  }

  async list(): Promise<TaskPlan[]> {
    return await listPlansLocal(this.baseDir);
  }

  async delete(planId: string): Promise<boolean> {
    const localDeleted = await deletePlanLocal(planId, this.baseDir);
    if (this.syncFirestore) {
      await deletePlanFirestore(planId);
    }
    return localDeleted;
  }
}
