import admin from "firebase-admin";
import fs from "fs";
import { config } from "../config/env.js";
import type { Trade, KnowledgeItem, ActiveSession, UserState } from "./types.js";

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
      goldenMeans: data.goldenMeans || {
        prioritization: 0,
        documentation: 0,
        waysToWork: 0,
        timeManagement: 0,
        variety: 0,
        vitality: 0,
        expressionism: 0,
      },
      activePlugins: data.activePlugins || ["monotropic-flow-v1"],
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
      vitality: 0,
      expressionism: 0,
    },
    activePlugins: ["monotropic-flow-v1"],
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
  const snapshot = await tradesCollection
    .where("userId", "==", userId)
    .orderBy("timestamp", "desc")
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
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
