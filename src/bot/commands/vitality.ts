import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config/env.js";
import { db, createTrade } from "../../db/firestore.js";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash-lite" });

export async function handleVitality(ctx: Context) {
  const keyboard = new InlineKeyboard()
    .text("🥗 Log Clean Meal", "action:meal_prompt")
    .text("⚡ 15m Kinetic Reset", "action:spark_kinetic")
    .row()
    .text("🧴 Grooming Protocol", "action:grooming_guide")
    .text("📊 Balance Radar", "action:balance");

  const message =
    `🦾 *FABRIC VITALITY CORE: BIOLOGICAL ARCHITECTURE*\n\n` +
    `Your physical body is the primary hardware executing the Fabric Meta-OS.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `1️⃣ *KINETIC SUBSYSTEM (CNS & Elasticity)*\n` +
    `• *Plyometrics (2x/wk, 15m):* Fast tendon recoil, jump squats, skater hops, BDNF surge.\n` +
    `• *Dancercise (Fluid Play):* Uncontrolled freestyle movement to break cognitive paralysis.\n` +
    `• *Postural Tension:* Scapular retraction, thoracic extension, anti-desk alignment.\n\n` +
    `2️⃣ *METABOLIC & FUEL (Cellular Energy)*\n` +
    `• *Whole-Food Baseline:* Zero ultra-processed oils; high micronutrients (berries, leafy greens).\n` +
    `• *Protein Satiety:* 1.6–2.0g per kg of bodyweight for muscle retention & dopamine synthesis.\n` +
    `• *Hydration & Electrolytes:* Morning 500ml water + pinch of unrefined salt.\n` +
    `• *Command:* Log meals instantly with \`/meal <description>\`\n\n` +
    `3️⃣ *SOMATIC GROOMING & AESTHETICS (Best Self)*\n` +
    `• *Skincare AM:* Gentle cleanser $\\rightarrow$ Vitamin C / Niacinamide $\\rightarrow$ Lightweight Moisturizer $\\rightarrow$ SPF 50.\n` +
    `• *Skincare PM:* Double cleanse $\\rightarrow$ Retinoid / AHA-BHA $\\rightarrow$ Barrier Repair Cream.\n` +
    `• *Beard Architecture:* Defined neckline (2 fingers above Adam's apple), daily boar-bristle brush, jojoba-argan oil conditioning.\n` +
    `• *Olfactory Identity:* Distinctive, intentional signature fragrance (fresh/woody daytime, amber/spicy evening).\n` +
    `• *Hygiene Standard:* Crisp dental care (tongue scraping + flossing), trimmed nails, pristine wardrobe discipline.\n\n` +
    `_Virtue lies in deliberate self-respect, never vain posturing or slovenly neglect._`;

  await ctx.reply(message, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleMeal(ctx: Context) {
  const userId = ctx.from?.id.toString();
  if (!userId) return;

  const mealText = ctx.message?.text?.replace(/^\/meal\s*/i, "").trim();

  if (!mealText) {
    await ctx.reply(
      `🥗 *Metabolic Meal Logger*\n\n` +
        `Usage: \`/meal <description of food>\`\n` +
        `_Example: \`/meal 3 boiled eggs, sourdough toast, black coffee, and handful of blueberries\`_\n\n` +
        `Fabric evaluates anti-inflammatory quality, macronutrients, and records to your Vitality ledger.`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const waitMsg = await ctx.reply("🔬 *Analyzing metabolic fuel & nutritional density...*", {
    parse_mode: "Markdown",
  });

  try {
    const prompt = `
You are the Metabolic Nutrition Engine for "The Fabric: 4F Meta-OS".
Analyze the user's meal: "${mealText}"

Evaluate:
1. Estimated Protein, Carbs, Fats, Calories.
2. Anti-inflammatory Quality Score (1 to 10).
3. Concise feedback on how this meal affects cognitive focus and energy stability (blood sugar spike risk vs clean sustained fuel).
4. One minor optimization tweak for next time.

Respond in clean Telegram Markdown under 140 words:
🥗 *METABOLIC FUEL REPORT*
• *Macros (Approx):* P: ~Xg | C: ~Xg | F: ~Xg (~X kcal)
• *Anti-Inflammatory Score:* X/10 [Emoji]
• *Cognitive Impact:* [1-2 sentences]
• *Tweak:* [1 crisp recommendation]
`;

    const response = await model.generateContent(prompt);
    const analysis = response.response.text().trim();

    // Log as Vitality Trade in Firestore
    await createTrade({
      userId,
      timestamp: new Date(),
      tradeType: "builder",
      moduleName: "Vitality: Metabolic Fuel",
      focusExpectedHours: 0.25,
      focusActualHours: 0.25,
      factsYield: `Logged meal: ${mealText.slice(0, 50)}`,
      fundsCost: 0,
      fundsYield: 0,
      energyDelta: 1,
      tags: ["vitality", "nutrition", "meal", "health"],
    });

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, analysis, {
      parse_mode: "Markdown",
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ Could not analyze meal: ${err.message}`
    );
  }
}
