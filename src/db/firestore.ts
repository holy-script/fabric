import admin from "firebase-admin";
import fs from "fs";
import { config } from "../config/env.js";
import type { Trade, KnowledgeItem, ActiveSession, UserState, GoalItem } from "./types.js";
export type { GoalItem };

// Initialize Firebase Admin App
if (!admin.apps.length) {
  if (config.firebaseServiceAccountKey) {
    try {
      const serviceAccount = JSON.parse(config.firebaseServiceAccountKey);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebaseProjectId,
      });
    } catch {
      // If base64 encoded
      const decoded = Buffer.from(config.firebaseServiceAccountKey, "base64").toString("utf8");
      const serviceAccount = JSON.parse(decoded);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: config.firebaseProjectId,
      });
    }
  } else if (config.firebaseServiceAccountPath) {
    const serviceAccount = JSON.parse(
      fs.readFileSync(config.firebaseServiceAccountPath, "utf8")
    );
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: config.firebaseProjectId,
    });
  } else {
    admin.initializeApp({
      projectId: config.firebaseProjectId,
    });
  }
}

export const db = admin.firestore();

// Collection References
export const tradesCollection = db.collection("trades");
export const knowledgeCollection = db.collection("knowledge");
export const sessionsCollection = db.collection("sessions");
export const userStatesCollection = db.collection("userState");
export const goalsCollection = db.collection("goals");
export const settingsCollection = db.collection("settings");
export const graphsCollection = db.collection("graphs");

export async function setVaultChannelId(channelId: string, userId: string = "1131646846"): Promise<void> {
  try {
    await Promise.all([
      settingsCollection.doc("vault").set({
        channelId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      userStatesCollection.doc(userId).set({
        vaultChannelId: channelId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
  } catch (err) {
    console.warn("⚠️ Could not persist vaultChannelId to Firestore:", err);
  }
}

export async function getVaultChannelId(userId: string = "1131646846"): Promise<string | null> {
  try {
    const doc = await settingsCollection.doc("vault").get();
    if (doc.exists && doc.data()?.channelId) {
      return doc.data()!.channelId as string;
    }
  } catch {}

  try {
    const userDoc = await userStatesCollection.doc(userId).get();
    if (userDoc.exists && userDoc.data()?.vaultChannelId) {
      return userDoc.data()!.vaultChannelId as string;
    }
  } catch {}

  return null;
}

// Helper: Log a completed trade
export async function createTrade(trade: Omit<Trade, "id">): Promise<string> {
  const docRef = await tradesCollection.add({
    ...trade,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  
  // Update cumulative user state
  await updateUserStateOnTrade(trade.userId, trade);
  
  return docRef.id;
}

// Helper: Save a knowledge item (win, gotcha, tool, etc.)
export async function createKnowledgeItem(
  item: Omit<KnowledgeItem, "id">
): Promise<string> {
  const docRef = await knowledgeCollection.add({
    ...item,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

// Helper: Query knowledge items by category (win, gotcha, etc.)
export async function getKnowledgeItems(
  userId: string,
  category?: string,
  limitCount = 10
): Promise<KnowledgeItem[]> {
  let query = knowledgeCollection
    .where("userId", "==", userId);

  if (category) {
    query = query.where("category", "==", category);
  }

  try {
    const snapshot = await query
      .orderBy("timestamp", "desc")
      .limit(limitCount)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        timestamp: data.timestamp?.toDate() || new Date(),
        category: data.category,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
        actionableTakeaway: data.actionableTakeaway,
        sourceUrl: data.sourceUrl,
        author: data.author,
        quadrant: data.quadrant,
      };
    });
  } catch (err: any) {
    // Resilient fallback if composite index is pending or not created yet
    if (err?.code === 9 || err?.message?.includes("index")) {
      const fallbackSnap = await knowledgeCollection
        .where("userId", "==", userId)
        .limit(limitCount * 4)
        .get();

      let items = fallbackSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          userId: data.userId,
          timestamp: data.timestamp?.toDate() || new Date(),
          category: data.category,
          title: data.title,
          content: data.content,
          tags: data.tags || [],
          actionableTakeaway: data.actionableTakeaway,
          sourceUrl: data.sourceUrl,
          author: data.author,
          quadrant: data.quadrant,
        };
      });

      if (category) {
        items = items.filter((d) => d.category.toLowerCase() === category.toLowerCase());
      }

      items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return items.slice(0, limitCount);
    }
    throw err;
  }
}

// Helper: Update a knowledge item with user's personal reflection/conclusion
export async function addReflectionToKnowledgeItem(
  itemId: string,
  reflection: { text: string; audioUrl?: string }
): Promise<void> {
  const docRef = knowledgeCollection.doc(itemId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error(`Knowledge item ${itemId} not found`);
  }

  const existingReflections = doc.data()?.userReflections || [];
  const newReflection = {
    text: reflection.text,
    audioUrl: reflection.audioUrl || null,
    timestamp: new Date(),
  };

  await docRef.update({
    userConclusions: reflection.text,
    userReflections: [...existingReflections, newReflection],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Helper: Attach R2 media stream URL to a knowledge item
export async function updateKnowledgeItemStreamUrl(
  itemId: string,
  streamUrl: string,
  r2NodeId?: string,
  r2Key?: string,
  mediaType?: "video" | "audio"
): Promise<void> {
  const updatePayload: Record<string, any> = {
    streamUrl,
    r2NodeId: r2NodeId || null,
    r2Key: r2Key || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (mediaType) {
    updatePayload.mediaType = mediaType;
  }
  await knowledgeCollection.doc(itemId).update(updatePayload);
}

// Helper: Update a knowledge item with Notion sync info
export async function updateKnowledgeItemNotion(
  itemId: string,
  notionUrl: string,
  notionPageId?: string
): Promise<void> {
  await knowledgeCollection.doc(itemId).update({
    notionUrl,
    ...(notionPageId ? { notionPageId } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Helper: Find a knowledge item by direct ID or search query
export async function findKnowledgeItem(
  userId: string,
  queryOrId: string
): Promise<KnowledgeItem | null> {
  // 1. Try direct ID
  const directDoc = await knowledgeCollection.doc(queryOrId).get();
  if (directDoc.exists) {
    const data = directDoc.data()!;
    return {
      id: directDoc.id,
      userId: data.userId,
      timestamp: data.timestamp?.toDate() || new Date(),
      category: data.category,
      title: data.title,
      content: data.content,
      tags: data.tags || [],
      actionableTakeaway: data.actionableTakeaway,
      sourceUrl: data.sourceUrl,
      author: data.author,
      quadrant: data.quadrant,
      streamUrl: data.streamUrl,
      r2NodeId: data.r2NodeId,
      r2Key: data.r2Key,
      mediaType: data.mediaType,
      userConclusions: data.userConclusions,
      userReflections: data.userReflections,
      notionUrl: data.notionUrl || undefined,
      notionPageId: data.notionPageId || undefined,
    };
  }

  // 2. Search in recent items by title, tag, or author
  const cleanQ = queryOrId.toLowerCase().trim();
  const snap = await knowledgeCollection.where("userId", "==", userId).limit(100).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const titleMatch = data.title?.toLowerCase().includes(cleanQ);
    const tagMatch = (data.tags || []).some((t: string) => t.toLowerCase().includes(cleanQ));
    const authorMatch = data.author?.toLowerCase().includes(cleanQ);
    if (titleMatch || tagMatch || authorMatch) {
      return {
        id: doc.id,
        userId: data.userId,
        timestamp: data.timestamp?.toDate() || new Date(),
        category: data.category,
        title: data.title,
        content: data.content,
        tags: data.tags || [],
        actionableTakeaway: data.actionableTakeaway,
        sourceUrl: data.sourceUrl,
        author: data.author,
        quadrant: data.quadrant,
        streamUrl: data.streamUrl,
        r2NodeId: data.r2NodeId,
        r2Key: data.r2Key,
        mediaType: data.mediaType,
        userConclusions: data.userConclusions,
        userReflections: data.userReflections,
        notionUrl: data.notionUrl || undefined,
        notionPageId: data.notionPageId || undefined,
      };
    }
  }

  return null;
}

// Helper: Start a /spark session
export async function startSession(session: ActiveSession): Promise<void> {
  await sessionsCollection.doc(session.userId).set({
    ...session,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// Helper: Get active /spark session
export async function getActiveSession(
  userId: string
): Promise<ActiveSession | null> {
  const doc = await sessionsCollection.doc(userId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    userId: data.userId,
    startedAt: data.startedAt?.toDate() || new Date(),
    taskDescription: data.taskDescription,
    focusExpectedHours: data.focusExpectedHours,
    tags: data.tags || [],
  };
}

// Helper: Clear active session
export async function clearSession(userId: string): Promise<void> {
  await sessionsCollection.doc(userId).delete();
}

// Helper: Get or create User State
export async function getUserState(userId: string): Promise<UserState> {
  const doc = await userStatesCollection.doc(userId).get();
  if (doc.exists) {
    const data = doc.data()!;
    return {
      userId,
      totalFocusHours: data.totalFocusHours || 0,
      totalFactsAcquired: data.totalFactsAcquired || 0,
      totalFundsSpent: data.totalFundsSpent || 0,
      totalFundsYield: data.totalFundsYield || 0,
      averageEnergyDelta: data.averageEnergyDelta || 0,
      goldenMeans: {
        prioritization: 0,
        documentation: 0,
        waysToWork: 0,
        timeManagement: 0,
        variety: 0,
        goalsAndRewards: 0,
        portfolioGrowth: 0,
        skillHorizon: 0,
        rapidPrototyping: 0,
        expressionism: 0,
        vitality: 0,
        ...(data.goldenMeans || {}),
      },
      activePlugins: data.activePlugins || ["monotropic-flow"],
      lastAudit: data.lastAudit?.toDate() || undefined,
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  }

  const defaultState: UserState = {
    userId,
    totalFocusHours: 0,
    totalFactsAcquired: 0,
    totalFundsSpent: 0,
    totalFundsYield: 0,
    averageEnergyDelta: 0,
    goldenMeans: {
      prioritization: 0,
      documentation: 0,
      waysToWork: 0,
      timeManagement: 0,
      variety: 0,
      goalsAndRewards: 0,
      portfolioGrowth: 0,
      skillHorizon: 0,
      rapidPrototyping: 0,
      expressionism: 0,
      vitality: 0,
    },
    activePlugins: ["monotropic-flow"],
    updatedAt: new Date(),
  };

  await userStatesCollection.doc(userId).set({
    ...defaultState,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return defaultState;
}

// Update UserState whenever a trade is logged
async function updateUserStateOnTrade(
  userId: string,
  trade: Omit<Trade, "id">
): Promise<void> {
  const state = await getUserState(userId);
  
  const newFocus = (state.totalFocusHours || 0) + (trade.focusActualHours || 0);
  const newFacts = (state.totalFactsAcquired || 0) + (trade.factsYield ? 1 : 0);
  const newSpent = (state.totalFundsSpent || 0) + (trade.fundsCost || 0);
  const newYield = (state.totalFundsYield || 0) + (trade.fundsYield || 0);
  
  // Exponential moving average for energy delta
  const alpha = 0.2;
  const currentAvgEnergy = state.averageEnergyDelta || 0;
  const newAvgEnergy = currentAvgEnergy * (1 - alpha) + trade.energyDelta * alpha;

  await userStatesCollection.doc(userId).set(
    {
      totalFocusHours: Math.round(newFocus * 100) / 100,
      totalFactsAcquired: newFacts,
      totalFundsSpent: Math.round(newSpent * 100) / 100,
      totalFundsYield: Math.round(newYield * 100) / 100,
      averageEnergyDelta: Math.round(newAvgEnergy * 10) / 10,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// Helper: Query recent trades
export async function getRecentTrades(
  userId: string,
  limitCount = 5
): Promise<Trade[]> {
  let docs: admin.firestore.QueryDocumentSnapshot[];
  try {
    const snapshot = await tradesCollection
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .limit(limitCount)
      .get();
    docs = snapshot.docs;
  } catch (err: unknown) {
    // If composite index is pending, fallback to filtering by userId and sorting in-memory
    const snapshot = await tradesCollection
      .where("userId", "==", userId)
      .get();
    docs = snapshot.docs;
    docs.sort((a, b) => {
      const timeA = a.data().timestamp?.toMillis() || 0;
      const timeB = b.data().timestamp?.toMillis() || 0;
      return timeB - timeA;
    });
    docs = docs.slice(0, limitCount);
  }

  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      timestamp: data.timestamp?.toDate() || new Date(),
      moduleName: data.moduleName,
      tradeType: data.tradeType,
      focusExpectedHours: data.focusExpectedHours,
      focusActualHours: data.focusActualHours,
      factsInput: data.factsInput,
      factsYield: data.factsYield,
      fundsCost: data.fundsCost,
      fundsYield: data.fundsYield,
      energyDelta: data.energyDelta,
      tags: data.tags || [],
      notes: data.notes,
    };
  });
}

// Helper: Goal model
export async function createGoal(goal: Omit<GoalItem, "id" | "createdAt" | "isUnlocked">): Promise<string> {
  const docRef = await goalsCollection.add({
    ...goal,
    isUnlocked: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function getUserGoals(userId: string): Promise<GoalItem[]> {
  let docs: admin.firestore.QueryDocumentSnapshot[];
  try {
    const snapshot = await goalsCollection
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .get();
    docs = snapshot.docs;
  } catch (err: unknown) {
    const snapshot = await goalsCollection
      .where("userId", "==", userId)
      .get();
    docs = snapshot.docs;
    docs.sort((a, b) => {
      const timeA = a.data().createdAt?.toMillis() || 0;
      const timeB = b.data().createdAt?.toMillis() || 0;
      return timeB - timeA;
    });
  }

  return docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId,
      title: data.title,
      targetMetric: data.targetMetric,
      targetFocusHours: data.targetFocusHours,
      reward: data.reward,
      isUnlocked: data.isUnlocked || false,
      unlockedAt: data.unlockedAt?.toDate(),
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}

export async function unlockGoal(goalId: string): Promise<void> {
  await goalsCollection.doc(goalId).update({
    isUnlocked: true,
    unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
