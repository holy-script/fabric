import type { Context } from "grammy";
import { getConnectedDevices, sendAirtelSms } from "../../services/sms.js";

export async function handleSms(ctx: Context) {
  const text = ctx.message?.text?.replace(/^\/sms\s*/i, "").trim();

  const devices = await getConnectedDevices();
  const deviceStatus = devices.length > 0
    ? `📱 *Connected Android Device:* \`${devices[0]}\` (Airtel SIM Ready ✅)`
    : `⚠️ *No Android Device Attached via ADB*\n_Plug in phone via USB with USB Debugging enabled, or connect via Wi-Fi: \`adb connect <phone_ip>:5555\`_`;

  if (!text) {
    await ctx.reply(
      `📱 *AIRTEL GSM SMS GATEWAY*\n\n` +
        `${deviceStatus}\n\n` +
        `*Free Quota:* ~100 SMS / day (included on Airtel mobile recharge).\n\n` +
        `*Usage:*\n` +
        `• \`/sms <mobile_number> <message>\`\n` +
        `• \`/sms self <message>\` (pushes alert directly to your phone lockscreen without internet!)\n\n` +
        `_Example: \`/sms +919876543210 Flight plan locked: 4.5h Focus on Fabric.\`_`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  const parts = text.split(/\s+/);
  const rawRecipient = parts[0];
  const messageBody = parts.slice(1).join(" ");

  if (!messageBody) {
    await ctx.reply("⚠️ Please provide a message body: `/sms <number> <message>`", {
      parse_mode: "Markdown",
    });
    return;
  }

  const recipient = rawRecipient.toLowerCase() === "self" ? "+919876543210" : rawRecipient;

  const waitMsg = await ctx.reply(`📡 *Dispatching SMS via Android Airtel modem to ${recipient}...*`, {
    parse_mode: "Markdown",
  });

  const res = await sendAirtelSms(recipient, messageBody);

  if (res.success) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `✅ *SMS Dispatched via Airtel SIM!*\n\n` +
        `📱 Recipient: \`${res.recipient}\`\n` +
        `💬 Message: _${res.message}_\n` +
        `⚡ Method: \`${res.method}\``,
      { parse_mode: "Markdown" }
    );
  } else {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ *SMS Dispatch Failed*\n\n` +
        `Error: _${res.error}_\n\n` +
        `*Setup:* Enable Developer Options $\\rightarrow$ USB Debugging on your Android phone with Airtel SIM.`,
      { parse_mode: "Markdown" }
    );
  }
}

