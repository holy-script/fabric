import admin from "firebase-admin";
import { db } from "../db/firestore.js";
import { STARTER_DOMAINS } from "./catalog.js";
import type { DomainDefinition, UserDomainState } from "./types.js";

const DEFAULT_ACTIVE_IDS = [
  "goldbees-etf",
  "explainable-dsa",
  "sidequest-lab",
  "metabolic-nutrition",
  "somatic-grooming",
];

const MAX_ACTIVE_SLOTS = 7;

export async function getUserDomainState(userId: string): Promise<UserDomainState> {
  const doc = await db.collection("userState").doc(userId).get();
  const data = doc.data() || {};

  const activeDomainIds: string[] =
    Array.isArray(data.activeDomainIds) && data.activeDomainIds.length > 0
      ? data.activeDomainIds
      : DEFAULT_ACTIVE_IDS;

  const customDomains: DomainDefinition[] = Array.isArray(data.customDomains)
    ? data.customDomains
    : [];

  return {
    activeDomainIds,
    customDomains,
    maxActiveSlots: data.maxActiveSlots || MAX_ACTIVE_SLOTS,
    lastSwappedAt: data.lastSwappedAt,
  };
}

export async function getAllDomains(userId: string): Promise<{
  active: DomainDefinition[];
  bench: DomainDefinition[];
  allMap: Map<string, DomainDefinition>;
}> {
  const state = await getUserDomainState(userId);
  const allMap = new Map<string, DomainDefinition>();

  // 1. Add all starter catalog domains
  for (const [id, domain] of Object.entries(STARTER_DOMAINS)) {
    allMap.set(id, { ...domain, status: state.activeDomainIds.includes(id) ? "active" : "bench" });
  }

  // 2. Add/override with user custom domains
  for (const custom of state.customDomains) {
    allMap.set(custom.id, {
      ...custom,
      status: state.activeDomainIds.includes(custom.id) ? "active" : "bench",
    });
  }

  const active: DomainDefinition[] = [];
  const bench: DomainDefinition[] = [];

  for (const domain of allMap.values()) {
    if (domain.status === "active") {
      active.push(domain);
    } else {
      bench.push(domain);
    }
  }

  return { active, bench, allMap };
}

export async function swapDomain(
  userId: string,
  fromId: string,
  toId: string
): Promise<{ success: boolean; message: string }> {
  const state = await getUserDomainState(userId);
  const { allMap } = await getAllDomains(userId);

  const targetFrom = allMap.get(fromId);
  const targetTo = allMap.get(toId);

  if (!targetFrom) {
    return { success: false, message: `Domain \`${fromId}\` not found.` };
  }
  if (!targetTo) {
    return { success: false, message: `Domain \`${toId}\` not found in catalog or bench.` };
  }

  if (!state.activeDomainIds.includes(fromId)) {
    return { success: false, message: `Domain *${targetFrom.name}* is not currently mounted in an active slot.` };
  }

  const newActive = state.activeDomainIds.filter((id) => id !== fromId);
  if (!newActive.includes(toId)) {
    newActive.push(toId);
  }

  await db.collection("userState").doc(userId).set(
    {
      activeDomainIds: newActive,
      lastSwappedAt: new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    message: `🔄 *Domain Swapped!*\n\n` +
      `🗄️ Benched: *${targetFrom.icon} ${targetFrom.name}*\n` +
      `⚡ Mounted to Slot: *${targetTo.icon} ${targetTo.name}*\n\n` +
      `_${targetTo.description}_`,
  };
}

export async function activateDomain(
  userId: string,
  domainId: string
): Promise<{ success: boolean; message: string }> {
  const state = await getUserDomainState(userId);
  const { allMap } = await getAllDomains(userId);

  const domain = allMap.get(domainId);
  if (!domain) {
    return { success: false, message: `Domain \`${domainId}\` not found.` };
  }

  if (state.activeDomainIds.includes(domainId)) {
    return { success: false, message: `*${domain.name}* is already active on your workbench.` };
  }

  if (state.activeDomainIds.length >= state.maxActiveSlots) {
    return {
      success: false,
      message: `⚠️ Active slots full (${state.activeDomainIds.length}/${state.maxActiveSlots}).\n` +
        `Use \`/domain swap <oldId> <newId>\` or bench an existing domain first.`,
    };
  }

  const newActive = [...state.activeDomainIds, domainId];

  await db.collection("userState").doc(userId).set(
    {
      activeDomainIds: newActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    message: `✅ Mounted *${domain.icon} ${domain.name}* to active workbench slot (${newActive.length}/${state.maxActiveSlots}).`,
  };
}

export async function benchDomain(
  userId: string,
  domainId: string
): Promise<{ success: boolean; message: string }> {
  const state = await getUserDomainState(userId);
  const { allMap } = await getAllDomains(userId);

  const domain = allMap.get(domainId);
  if (!domain) {
    return { success: false, message: `Domain \`${domainId}\` not found.` };
  }

  if (!state.activeDomainIds.includes(domainId)) {
    return { success: false, message: `*${domain.name}* is already benched.` };
  }

  const newActive = state.activeDomainIds.filter((id) => id !== domainId);

  await db.collection("userState").doc(userId).set(
    {
      activeDomainIds: newActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    message: `🗄️ Benched *${domain.icon} ${domain.name}*. Preserved in reserve vault.`,
  };
}

export async function addCustomDomain(
  userId: string,
  params: {
    name: string;
    pillar?: string;
    description?: string;
    tags?: string[];
    icon?: string;
  }
): Promise<{ success: boolean; domain: DomainDefinition; message: string }> {
  const id = params.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const newDomain: DomainDefinition = {
    id,
    name: params.name,
    pillar: params.pillar || "Custom Horizon",
    status: "active",
    icon: params.icon || "✨",
    description: params.description || `Custom focus domain for ${params.name}.`,
    tags: params.tags || [id],
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  const state = await getUserDomainState(userId);
  const customList = [...state.customDomains.filter((d) => d.id !== id), newDomain];
  const newActive = state.activeDomainIds.includes(id) ? state.activeDomainIds : [...state.activeDomainIds, id];

  await db.collection("userState").doc(userId).set(
    {
      customDomains: customList,
      activeDomainIds: newActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    success: true,
    domain: newDomain,
    message: `✨ *Custom Domain Created & Mounted!*\n\n` +
      `*${newDomain.icon} ${newDomain.name}*\n` +
      `🏛️ Pillar: _${newDomain.pillar}_\n` +
      `📝 _${newDomain.description}_`,
  };
}

