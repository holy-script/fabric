import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import admin from "firebase-admin";
import { db } from "../../db/firestore.js";

export const sidequestsCollection = db.collection("sidequests");

export interface SidequestItem {
  id?: string;
  userId: string;
  title: string;
  category: "weird_tech" | "art_film" | "physical_play" | "curious_rabbit_hole";
  durationMinutes: number;
  description: string;
  energyYield: "+1" | "+2" | "+3";
  isCompleted: boolean;
  createdAt?: Date;
}

const DEFAULT_SIDEQUESTS: Omit<SidequestItem, "userId">[] = [
  {
    title: "Minimalist GLSL Shader Sandbox",
    category: "weird_tech",
    durationMinutes: 20,
    description: "Open ShaderToy or a local canvas. Code an organic glowing orb using sin/cos noise functions. Zero commercial intent, pure visual magic.",
    energyYield: "+3",
    isCompleted: false,
  },
  {
    title: "15-Minute Uncontrolled Dancercise CNS Flush",
    category: "physical_play",
    durationMinutes: 15,
    description: "Blast 3 high-tempo synthwave or breakbeat tracks. Full-body freestyle movement without looking in a mirror. Break somatic logjams.",
    energyYield: "+3",
    isCompleted: false,
  },
  {
    title: "30-Second Micro-Cinema Color Grade",
    category: "art_film",
    durationMinutes: 25,
    description: "Take any raw footage clip from your phone. Grade it with extreme cinematic film emulation (Kodak 2383 look, halation, grain) and export a 15-second teaser.",
    energyYield: "+2",
    isCompleted: false,
  },
  {
    title: "Retro Chiptune Sound Synthesizer Patch",
    category: "weird_tech",
    durationMinutes: 20,
    description: "Open Vital, Serum, or a free web synthesizer. Build a 1980s brass lead or a punchy 8-bit arpeggio from pure square waves.",
    energyYield: "+2",
    isCompleted: false,
  },
  {
    title: "Etymology & Obscure Word Deep Dive",
    category: "curious_rabbit_hole",
    durationMinutes: 15,
    description: "Pick 3 ancient Greek, Latin, or Sanskrit conceptual words (e.g., Eudaimonia, Kairos, Ataraxia). Trace their cognitive roots and write 1 aphorism.",
    energyYield: "+1",
    isCompleted: false,
  },
];

export async function handleSidequest(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const rawText = ctx.message?.text?.replace(/^\/sidequest\s*/i, "").trim();

  // Subcommand: add <title> [| description]
  if (rawText?.startsWith("add ")) {
    const content = rawText.replace(/^add\s+/i, "").trim();
    const parts = content.split("|").map((s) => s.trim());
    const title = parts[0];
    const desc = parts[1] || "A spontaneous creative sidequest.";

    await sidequestsCollection.add({
      userId,
      title,
      description: desc,
      category: "curious_rabbit_hole",
      durationMinutes: 20,
      energyYield: "+2",
      isCompleted: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await ctx.reply(
      `🎮 *Sidequest Stored in Vault!*\n\n` +
        `🎯 *Mission:* ${title}\n` +
        `📝 _${desc}_\n\n` +
        `Whenever boredom or fatigue strikes, roll it with \`/sidequest\`!`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Subcommand: list
  if (rawText === "list") {
    const snap = await sidequestsCollection.where("userId", "==", userId).limit(10).get();
    if (snap.empty) {
      await ctx.reply(
        `🎮 *Your Sidequest Vault is Empty*\n\n` +
          `Add your quirky ideas anytime with: \`/sidequest add <title> | <description>\`\n` +
          `Or type \`/sidequest\` to roll from the master catalog!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    const list = snap.docs
      .map((d, i) => {
        const q = d.data();
        return `*${i + 1}.* ${q.title} (\`${q.durationMinutes}m\`, Energy: ${q.energyYield})\n   _${q.description}_`;
      })
      .join("\n\n");

    await ctx.reply(`🎮 *Your Custom Sidequests:*\n\n${list}`, { parse_mode: "Markdown" });
    return;
  }

  // Default: Roll a random sidequest
  let candidateQuests: any[] = [...DEFAULT_SIDEQUESTS];

  try {
    const snap = await sidequestsCollection.where("userId", "==", userId).limit(20).get();
    snap.docs.forEach((doc) => {
      candidateQuests.push({ id: doc.id, ...doc.data() });
    });
  } catch {}

  const rolled = candidateQuests[Math.floor(Math.random() * candidateQuests.length)];

  const categoryEmoji =
    rolled.category === "weird_tech"
      ? "💻"
      : rolled.category === "art_film"
      ? "🎬"
      : rolled.category === "physical_play"
      ? "⚡"
      : "🔮";

  const keyboard = new InlineKeyboard()
    .text("🎲 Roll Another", "action:sidequest_roll")
    .text("⚡ Spark Session", "action:spark_prompt");

  const message =
    `🎲 *SIDEQUEST DISPATCH: ANTI-FATIGUE ESCAPE HATCH*\n\n` +
    `When executive focus is low, novel creative play resets dopamine receptors without the shame of doomscrolling.\n\n` +
    `*Mission:* ${categoryEmoji} *${rolled.title}*\n` +
    `⏱️ *Time Horizon:* \`${rolled.durationMinutes} mins\`\n` +
    `🔋 *Expected CNS Surge:* \`${rolled.energyYield}\`\n\n` +
    `📜 *Briefing:*\n_${rolled.description}_\n\n` +
    `_No grades, no deadlines, no commercial pressure. Throw yourself into the craft for pure wonder._`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

