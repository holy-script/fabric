import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import {
  getActiveDevice,
  getDeviceStatsSummary,
  triggerDnd,
  type DeviceStatsSummary,
} from "../../services/telemetry-adb.js";

function getProgressBar(percent: number, totalSlots = 10): string {
  const filled = Math.min(
    totalSlots,
    Math.max(0, Math.round((percent / 100) * totalSlots))
  );
  return "█".repeat(filled) + "░".repeat(totalSlots - filled);
}

export function formatPhoneCard(summary: DeviceStatsSummary): {
  text: string;
  keyboard: InlineKeyboard;
} {
  const { battery, screen, network, uptime, memory, dnd, model, deviceId } =
    summary;

  // Battery Status
  const batteryBar = getProgressBar(battery.level);
  let batteryEmoji = "🔋";
  if (battery.charging) batteryEmoji = "⚡";
  else if (battery.level <= 15) batteryEmoji = "🪫";

  const chargeDesc = battery.charging
    ? `Charging (${battery.chargeType})`
    : battery.status;
  const tempStr = battery.temperature > 0 ? `${battery.temperature}°C` : "";
  const voltStr = battery.voltage > 0 ? `${(battery.voltage / 1000).toFixed(2)}V` : "";
  const batteryHealth = [battery.health, tempStr, voltStr]
    .filter(Boolean)
    .join(" • ");

  // Display & Screen State
  const screenEmoji = screen.screenOn ? "🟢" : "💤";
  const screenDesc = screen.screenOn
    ? `ON (${screen.wakefulness || "Awake"})`
    : `OFF (${screen.wakefulness || "Asleep"})`;
  const interactiveDesc = screen.interactive
    ? "Interactive Focus Active"
    : "Idle / Standby";

  // Memory & Uptime
  const memUsedGb = (memory.usedMb / 1024).toFixed(1);
  const memTotalGb = (memory.totalMb / 1024).toFixed(1);

  // Network State
  let netDesc = "Offline";
  if (network.airplaneMode) {
    netDesc = "✈️ Airplane Mode Active";
  } else if (network.activeTransport === "WIFI" && network.wifi.connected) {
    const ssid = network.wifi.ssid ? `"${network.wifi.ssid}"` : "Connected";
    const rssi = network.wifi.rssi ? ` (${network.wifi.rssi} dBm)` : "";
    netDesc = `Wi-Fi ${ssid}${rssi}`;
  } else if (
    network.activeTransport === "CELLULAR" ||
    network.cellular.connected
  ) {
    const op = network.cellular.operator || "Cellular";
    const type = network.cellular.networkType ? ` ${network.cellular.networkType}` : "";
    netDesc = `${op}${type} Mobile Data`;
  } else if (network.wifi.enabled) {
    netDesc = "Wi-Fi Scanning / Disconnected";
  }

  // Focus Mode / DND
  const dndEmoji = dnd.enabled ? "⚡" : "🔔";
  const dndStatus = dnd.enabled
    ? `Active (${dnd.label})`
    : `Off (Normal Sound & Alerts)`;

  const text =
    `📱 *FABRIC MOBILE TELEMETRY HUD*\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `*Hardware:* \`${model}\` \`(${deviceId})\`\n\n` +
    `${batteryEmoji} *Battery & Power:*\n` +
    `• Level: *${battery.level}%* \`[${batteryBar}]\`\n` +
    `• Status: *${chargeDesc}*\n` +
    `• Health: _${batteryHealth}_\n\n` +
    `📱 *Display & Interaction:*\n` +
    `• Screen: *${screenDesc}* ${screenEmoji}\n` +
    `• State: _${interactiveDesc}_\n` +
    `• Device Uptime: *${uptime.formatted}*\n` +
    `• System RAM: *${memUsedGb} GB / ${memTotalGb} GB* (${memory.percent}% used)\n\n` +
    `📶 *Network & Connectivity:*\n` +
    `• Status: *${netDesc}*\n` +
    (network.wifi.ip ? `• Device IP: \`${network.wifi.ip}\`\n` : "") +
    (network.cellular.operator ? `• SIM Carrier: *${network.cellular.operator}*\n` : "") +
    `\n` +
    `${dndEmoji} *Focus Mode / DND:*\n` +
    `• Shield Status: *${dndStatus}*\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `_Commands:_ \`/phone dnd on\` • \`/phone dnd off\``;

  const keyboard = new InlineKeyboard();
  if (dnd.enabled) {
    keyboard.text("🔔 Turn DND Off", "action:phone_dnd_off");
  } else {
    keyboard.text("⚡ Turn DND On", "action:phone_dnd_on");
  }
  keyboard.text("🔄 Refresh HUD", "action:phone_refresh");

  return { text, keyboard };
}

export function formatDisconnectedMessage(
  status: "connected" | "disconnected" | "unauthorized" | "offline" | "adb_missing",
  deviceId?: string
): string {
  if (status === "adb_missing") {
    return (
      `⚠️ *ADB Platform-Tools Not Found*\n\n` +
      `The local ADB binary was not found at the expected path.\n` +
      `Ensure the Android SDK is installed on the host system.`
    );
  }

  if (status === "unauthorized") {
    return (
      `📱 *Mobile Telemetry Bridge: Authorization Required*\n\n` +
      `🔒 *Device Detected:* \`${deviceId || "Android Device"}\`\n\n` +
      `Your phone is connected via USB/Wi-Fi, but ADB debugging authorization is pending.\n\n` +
      `👉 *Action Required:*\n` +
      `1. Unlock your phone screen.\n` +
      `2. Check the popup prompt: *"Allow USB debugging?"*\n` +
      `3. Tap **"Always allow from this computer"** and accept.\n` +
      `4. Run \`/phone\` again to view telemetry!`
    );
  }

  if (status === "offline") {
    return (
      `📱 *Mobile Telemetry Bridge: Device Offline*\n\n` +
      `⚠️ Device \`${deviceId || "Android Device"}\` is in offline mode.\n\n` +
      `*Troubleshooting:*\n` +
      `• Unplug and reconnect the USB cable, or\n` +
      `• Run \`adb reconnect\` from terminal, then re-issue \`/phone\`.`
    );
  }

  return (
    `📱 *Mobile Telemetry Bridge: Device Disconnected*\n\n` +
    `⚠️ *No Android device currently attached via ADB.*\n\n` +
    `To bridge your phone into The Fabric's 4F Telemetry mesh:\n\n` +
    `1. *USB Connection:*\n` +
    `   • Plug your phone into your Mac via USB.\n` +
    `   • Enable **Developer Options** $\\rightarrow$ **USB Debugging**.\n\n` +
    `2. *Wireless ADB:*\n` +
    `   • Ensure phone and Mac share the same Wi-Fi network.\n` +
    `   • In phone Developer Options, enable **Wireless Debugging**.\n` +
    `   • Run in terminal:\n` +
    `     \`adb connect <phone_ip>:5555\`\n` +
    `     _(e.g. \`adb connect 192.168.1.15:5555\`)_\n\n` +
    `Once linked, Fabric monitors battery vitals, screen interactive focus cycles, and network status in real time.`
  );
}

/**
 * Primary command handler for /phone and /phone dnd [on|off].
 */
export async function handlePhone(ctx: Context) {
  const text = ctx.message?.text?.replace(/^\/phone\s*/i, "").trim().toLowerCase();

  const { device, status } = await getActiveDevice();

  // Handle DND commands
  if (text === "dnd on" || text === "dnd 1" || text === "dnd enable") {
    if (status !== "connected" || !device) {
      await ctx.reply(formatDisconnectedMessage(status, device?.id), {
        parse_mode: "Markdown",
      });
      return;
    }

    const waitMsg = await ctx.reply("⚡ *Engaging Focus Shield via ADB...*", {
      parse_mode: "Markdown",
    });

    try {
      const res = await triggerDnd(true, device.id);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `⚡ *Focus Mode Engaged (DND Active)*\n\n` +
          `📱 Device: \`${device.model || device.id}\`\n` +
          `🛡️ State: *${res.label}*\n\n` +
          `_Incoming notifications silenced. Cognitive equilibrium shielded for deep execution._`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔔 Turn DND Off", "action:phone_dnd_off")
            .text("📱 View Telemetry", "action:phone_refresh"),
        }
      );
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ *Failed to toggle DND:*\n_${err.message}_`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  if (text === "dnd off" || text === "dnd 0" || text === "dnd disable") {
    if (status !== "connected" || !device) {
      await ctx.reply(formatDisconnectedMessage(status, device?.id), {
        parse_mode: "Markdown",
      });
      return;
    }

    const waitMsg = await ctx.reply("🔔 *Restoring sound & alert profile...*", {
      parse_mode: "Markdown",
    });

    try {
      const res = await triggerDnd(false, device.id);
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `🔔 *Focus Mode Disengaged (Normal Sound)*\n\n` +
          `📱 Device: \`${device.model || device.id}\`\n` +
          `🔊 State: *${res.label}*\n\n` +
          `_Alerts & incoming audio restored._`,
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("⚡ Turn DND On", "action:phone_dnd_on")
            .text("📱 View Telemetry", "action:phone_refresh"),
        }
      );
    } catch (err: any) {
      await ctx.api.editMessageText(
        ctx.chat!.id,
        waitMsg.message_id,
        `❌ *Failed to toggle DND:*\n_${err.message}_`,
        { parse_mode: "Markdown" }
      );
    }
    return;
  }

  // Fallback for disconnected / unauthorized states
  if (status !== "connected" || !device) {
    await ctx.reply(formatDisconnectedMessage(status, device?.id), {
      parse_mode: "Markdown",
    });
    return;
  }

  // Fetch full telemetry
  const waitMsg = await ctx.reply("📡 *Querying Android telemetry via ADB...*", {
    parse_mode: "Markdown",
  });

  try {
    const summary = await getDeviceStatsSummary(device.id);
    const { text: cardText, keyboard } = formatPhoneCard(summary);

    await ctx.api.editMessageText(ctx.chat!.id, waitMsg.message_id, cardText, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  } catch (err: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      waitMsg.message_id,
      `❌ *Error querying mobile telemetry:*\n_${err.message}_\n\n` +
        formatDisconnectedMessage("disconnected"),
      { parse_mode: "Markdown" }
    );
  }
}
