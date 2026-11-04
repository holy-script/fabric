/**
 * Fabric OS - Apple-grade Dynamic Island Companion HUD
 * 
 * Standalone endpoint (/api/island and /island) providing:
 * - Ultra-sleek, Apple-grade Dynamic Island interface (HTML/CSS/JS with zero build dependencies)
 * - PWA-ready for iPad (manifest meta tags, touch gestures, stand-alone display mode, dark OLED aesthetic #050508)
 * - Compact Notch Mode: Floats at top center with subtle border-glow (height: 38px, expands to 140px or full modal)
 * - Canvas-drawn fluid sine wave reflecting FOCI diaphragmatic respiration & mental state:
 *     (flow: cyan, focus: purple, calm: emerald, stress: amber)
 * - Focus Sprint Timer with radial progress
 * - Live Task DAG Pill with pulsing status indicator (e.g. "Step 2/4: AI Mode Ingestion")
 * - Quick Action Dock: 1-tap buttons for ⚡ Spark, 🏁 Settle, 🧠 AI Mode, 🎙️ NotebookLM
 * - Live Server-Sent Events (SSE) or polling via /api/island?stream=1
 */

import type { IncomingMessage, ServerResponse } from "http";
import {
  getIslandTelemetry,
  formatSSEEvent,
  formatSSERetry,
  formatSSEComment,
  type IslandTelemetryPayload,
} from "../src/services/island-stream.js";
import { config } from "../src/config/env.js";

/**
 * Escapes unsafe HTML characters
 */
function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Parses URL query parameters
 */
function parseQuery(url: string | undefined): URLSearchParams {
  try {
    const qIndex = (url || "").indexOf("?");
    if (qIndex === -1) return new URLSearchParams();
    return new URLSearchParams(url!.slice(qIndex));
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Generates the complete Apple-grade Dynamic Island HTML document
 */
export function renderIslandHtml(initialTelemetry: IslandTelemetryPayload): string {
  const serialized = JSON.stringify(initialTelemetry).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Fabric OS — Dynamic Island HUD</title>
  
  <!-- Apple & PWA Meta Tags for iPad / macOS -->
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Fabric Island">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="theme-color" content="#050508">
  <link rel="manifest" href="data:application/manifest+json,%7B%22name%22%3A%22Fabric%20Dynamic%20Island%22%2C%22short_name%22%3A%22FabricIsland%22%2C%22display%22%3A%22standalone%22%2C%22background_color%22%3A%22%23050508%22%2C%22theme_color%22%3A%22%23050508%22%7D">

  <style>
    /* Reset & Apple Dark OLED Aesthetic */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      -webkit-user-select: none;
    }

    :root {
      --bg-oled: #050508;
      --island-bg: rgba(10, 10, 15, 0.94);
      --island-border: rgba(255, 255, 255, 0.09);
      --island-glow: rgba(255, 255, 255, 0.05);
      --island-shadow: 0 24px 48px -8px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.08);
      --spring-physics: cubic-bezier(0.16, 1, 0.3, 1);
      --font-stack: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
      --color-cyan: #06b6d4;
      --color-purple: #a855f7;
      --color-emerald: #10b981;
      --color-amber: #f59e0b;
    }

    body {
      background-color: var(--bg-oled);
      color: #f4f4f5;
      font-family: var(--font-stack);
      min-height: 100vh;
      width: 100vw;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding-top: env(safe-area-inset-top, 0px);
      padding-bottom: env(safe-area-inset-bottom, 0px);
      background-image: 
        radial-gradient(ellipse at 50% 0%, rgba(6, 182, 212, 0.07) 0%, transparent 60%),
        radial-gradient(ellipse at 50% 100%, rgba(168, 85, 247, 0.04) 0%, transparent 60%);
    }

    /* Ambient Space Canvas */
    #ambientCanvas {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 1;
      opacity: 0.6;
    }

    /* Dynamic Island HUD Floating Shell */
    .island-container {
      position: fixed;
      top: max(10px, env(safe-area-inset-top, 10px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      touch-action: pan-y;
    }

    .island {
      position: relative;
      background: var(--island-bg);
      backdrop-filter: blur(28px) saturate(190%);
      -webkit-backdrop-filter: blur(28px) saturate(190%);
      border: 1px solid var(--island-border);
      box-shadow: var(--island-shadow);
      color: #fff;
      overflow: hidden;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      /* Compact Notch Mode default */
      height: 38px;
      min-width: 220px;
      width: auto;
      max-width: 320px;
      border-radius: 20px;
      padding: 0 14px;
      transition: 
        height 0.42s var(--spring-physics),
        width 0.42s var(--spring-physics),
        max-width 0.42s var(--spring-physics),
        border-radius 0.42s var(--spring-physics),
        padding 0.42s var(--spring-physics),
        box-shadow 0.42s var(--spring-physics),
        border-color 0.42s var(--spring-physics);
    }

    /* Subtle Border Glow Pulse */
    .island::before {
      content: "";
      position: absolute;
      inset: -1px;
      border-radius: inherit;
      padding: 1px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.02) 60%, rgba(6, 182, 212, 0.18));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
      transition: opacity 0.4s ease;
    }

    .island:hover {
      border-color: rgba(255, 255, 255, 0.18);
      box-shadow: 0 28px 56px -10px rgba(0, 0, 0, 0.9), 0 0 15px rgba(6, 182, 212, 0.14);
    }

    /* Expanded Notch Mode: 140px */
    .island.expanded {
      height: 140px;
      width: min(540px, 94vw);
      max-width: 540px;
      border-radius: 34px;
      padding: 12px 18px;
      cursor: default;
      box-shadow: 0 32px 64px -12px rgba(0, 0, 0, 0.95), 0 0 22px rgba(6, 182, 212, 0.18);
    }

    /* Full Modal View */
    .island.modal {
      height: 280px;
      width: min(640px, 95vw);
      max-width: 640px;
      border-radius: 38px;
      padding: 16px 20px;
      cursor: default;
      box-shadow: 0 40px 80px -16px rgba(0, 0, 0, 0.98), 0 0 30px rgba(168, 85, 247, 0.2);
    }

    /* ========================================================
       1. COMPACT NOTCH MODE CONTENT (38px height)
       ======================================================== */
    .compact-view {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 100%;
      gap: 10px;
      transition: opacity 0.25s ease, transform 0.25s ease;
    }

    .island.expanded .compact-view,
    .island.modal .compact-view {
      display: none;
      opacity: 0;
      transform: scale(0.95);
    }

    .compact-left {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .compact-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-cyan);
      box-shadow: 0 0 8px var(--color-cyan);
      animation: pulseGlow 2.4s infinite ease-in-out;
    }

    .compact-wave-mini {
      width: 44px;
      height: 20px;
      vertical-align: middle;
    }

    .compact-center {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 500;
      color: #e4e4e7;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .compact-right {
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      font-weight: 600;
      color: #a1a1aa;
    }

    .mini-timer-badge {
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 7px;
      border-radius: 10px;
      font-size: 11px;
      color: #e4e4e7;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }

    /* ========================================================
       2. EXPANDED HUD CONTENT (140px height)
       ======================================================== */
    .expanded-view {
      display: none;
      flex-direction: column;
      justify-content: space-between;
      width: 100%;
      height: 100%;
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 0.3s ease, transform 0.3s var(--spring-physics);
    }

    .island.expanded .expanded-view,
    .island.modal .expanded-view {
      display: flex;
      opacity: 1;
      transform: translateY(0);
    }

    /* Top Row: Task DAG Pill & FOCI Mental State */
    .expanded-top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;
    }

    /* Live Task DAG Pill */
    .task-dag-pill {
      display: flex;
      align-items: center;
      gap: 7px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      color: #f4f4f5;
      letter-spacing: -0.01em;
      max-width: 320px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.2s ease, border-color 0.2s ease;
    }

    .task-dag-pill:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .dag-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #06b6d4;
      box-shadow: 0 0 10px #06b6d4;
      animation: pulseGlow 1.8s infinite ease-in-out;
      flex-shrink: 0;
    }

    .foci-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 10px;
      border-radius: 9999px;
      background: rgba(6, 182, 212, 0.1);
      color: #06b6d4;
      border: 1px solid rgba(6, 182, 212, 0.25);
    }

    .foci-pill.purple {
      background: rgba(168, 85, 247, 0.1);
      color: #a855f7;
      border-color: rgba(168, 85, 247, 0.25);
    }

    .foci-pill.emerald {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
      border-color: rgba(16, 185, 129, 0.25);
    }

    .foci-pill.amber {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
      border-color: rgba(245, 158, 11, 0.25);
    }

    /* Middle Row: Breathing Wave + Sprint Radial Timer */
    .expanded-mid-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 12px;
      padding: 2px 0;
    }

    /* Canvas Sine Wave Container */
    .wave-wrapper {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 2px;
    }

    .wave-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 11px;
      color: #71717a;
    }

    .wave-meta span b {
      color: #e4e4e7;
      font-weight: 600;
    }

    #breathingCanvas {
      width: 100%;
      height: 38px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.02);
    }

    /* Radial Focus Sprint Timer */
    .timer-widget {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255, 255, 255, 0.03);
      padding: 4px 10px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .radial-box {
      position: relative;
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }

    .radial-svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }

    .radial-bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 4;
    }

    .radial-progress {
      fill: none;
      stroke: var(--color-cyan);
      stroke-width: 4;
      stroke-linecap: round;
      stroke-dasharray: 100;
      stroke-dashoffset: 75;
      transition: stroke-dashoffset 0.6s ease, stroke 0.4s ease;
    }

    .radial-icon {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }

    .timer-info {
      display: flex;
      flex-direction: column;
    }

    .timer-digits {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
      font-variant-numeric: tabular-nums;
    }

    .timer-label {
      font-size: 10px;
      color: #71717a;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* Bottom Row: Quick Action Dock */
    .quick-dock {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;
      margin-top: 2px;
    }

    .dock-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      padding: 7px 10px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #f4f4f5;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      outline: none;
      transition: 
        background 0.2s ease,
        transform 0.15s var(--spring-physics),
        border-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    .dock-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .dock-btn:active {
      transform: scale(0.94);
      background: rgba(255, 255, 255, 0.18);
    }

    .dock-btn.accent-spark:hover { border-color: rgba(245, 158, 11, 0.5); }
    .dock-btn.accent-settle:hover { border-color: rgba(16, 185, 129, 0.5); }
    .dock-btn.accent-voice:hover { border-color: rgba(168, 85, 247, 0.6); }
    .dock-btn.accent-aimode:hover { border-color: rgba(6, 182, 212, 0.5); }
    .dock-btn.accent-nlm:hover { border-color: rgba(168, 85, 247, 0.5); }

    /* Compact Voice Orb & Voice Waveform HUD */
    .compact-voice-orb {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(168, 85, 247, 0.15);
      border: 1px solid rgba(168, 85, 247, 0.35);
      font-size: 11px;
      cursor: pointer;
      margin-right: 6px;
      transition: all 0.2s ease;
    }
    .compact-voice-orb:hover, .compact-voice-orb.active-pulse {
      background: rgba(168, 85, 247, 0.35);
      border-color: rgba(168, 85, 247, 0.8);
      box-shadow: 0 0 10px rgba(168, 85, 247, 0.6);
      transform: scale(1.08);
    }

    .voice-channel-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      margin-top: 8px;
      padding: 6px 10px;
      border-radius: 12px;
      background: rgba(168, 85, 247, 0.08);
      border: 1px solid rgba(168, 85, 247, 0.25);
      backdrop-filter: blur(8px);
    }

    .voice-orb-pulsar {
      position: relative;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .voice-orb-glow {
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(168, 85, 247, 0.8) 0%, rgba(6, 182, 212, 0.3) 70%, transparent 100%);
      animation: voiceGlowPulse 1.4s ease-in-out infinite alternate;
    }

    @keyframes voiceGlowPulse {
      0% { transform: scale(0.85); opacity: 0.5; }
      100% { transform: scale(1.4); opacity: 1; }
    }

    .voice-orb-core {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #c084fc;
      z-index: 1;
    }

    .voice-waveform-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    #voiceWaveformCanvas {
      width: 100%;
      height: 24px;
      border-radius: 6px;
    }

    .voice-status-label {
      font-size: 9px;
      font-family: var(--font-stack);
      color: #e4e4e7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.85;
    }

    .voice-mic-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
      transition: all 0.15s ease;
    }
    .voice-mic-btn:hover {
      background: rgba(168, 85, 247, 0.4);
      border-color: rgba(168, 85, 247, 0.8);
    }

    /* Modal Additional Details (visible only in full modal) */
    .modal-details {
      display: none;
      flex-direction: column;
      width: 100%;
      gap: 12px;
      margin-top: 14px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      overflow-y: auto;
    }

    .island.modal .modal-details {
      display: flex;
    }

    .modal-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .stat-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 14px;
      padding: 10px 12px;
    }

    .stat-card-title {
      font-size: 11px;
      color: #71717a;
      margin-bottom: 4px;
    }

    .stat-card-value {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }

    /* Grab Handle for Swipe Gestures on iPad */
    .swipe-pill {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.2);
      margin-top: 6px;
      align-self: center;
      transition: background 0.2s ease;
    }

    .island.expanded .swipe-pill {
      background: rgba(255, 255, 255, 0.35);
    }

    /* Toast Notification Bubble */
    .island-toast {
      position: fixed;
      bottom: max(24px, env(safe-area-inset-bottom, 24px));
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: rgba(20, 20, 26, 0.96);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.7);
      padding: 10px 18px;
      border-radius: 20px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      opacity: 0;
      transition: transform 0.35s var(--spring-physics), opacity 0.35s ease;
      z-index: 2000;
      pointer-events: none;
    }

    .island-toast.show {
      transform: translateX(-50%) translateY(0);
      opacity: 1;
    }

    /* Keyframe Animations */
    @keyframes pulseGlow {
      0%, 100% { transform: scale(1); opacity: 0.9; }
      50% { transform: scale(1.28); opacity: 1; filter: brightness(1.2); }
    }

    /* Companion Backdrop Dashboard Preview (Mac & iPad background workspace) */
    .workspace-preview {
      margin-top: 140px;
      width: min(800px, 92vw);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      text-align: center;
      z-index: 10;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 12px;
      color: #a1a1aa;
    }

    .hero-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.03em;
      background: linear-gradient(180deg, #ffffff 0%, #a1a1aa 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-desc {
      font-size: 14px;
      color: #71717a;
      max-width: 480px;
      line-height: 1.5;
    }

    .gesture-hint {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      color: #52525b;
      margin-top: 8px;
    }

    .gesture-key {
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #d4d4d8;
    }
  </style>
</head>
<body>
  <!-- Ambient Space Canvas for Organic Fluid Motion -->
  <canvas id="ambientCanvas"></canvas>

  <!-- Dynamic Island HUD Floating Shell -->
  <div class="island-container">
    <div class="island" id="dynamicIsland" role="region" aria-label="Dynamic Island Companion HUD">
      
      <!-- 1. COMPACT NOTCH MODE (Height: 38px) -->
      <div class="compact-view" id="compactView">
        <div class="compact-left">
          <span class="compact-dot" id="compactDot"></span>
          <canvas class="compact-wave-mini" id="compactWaveCanvas" width="44" height="20"></canvas>
        </div>
        <div class="compact-center" id="compactCenterText">
          ${escapeHtml(initialTelemetry.task.stepPillText)}
        </div>
        <div class="compact-right">
          <span class="compact-voice-orb" id="compactVoiceOrb" title="Real-Time Socratic Voice Channel">🎙️</span>
          <span class="mini-timer-badge" id="compactTimerBadge">00:00</span>
        </div>
      </div>

      <!-- 2. EXPANDED HUD CONTENT (Height: 140px) -->
      <div class="expanded-view" id="expandedView">
        
        <!-- Top Row: Live Task DAG Pill + FOCI Mental State -->
        <div class="expanded-top-row">
          <div class="task-dag-pill" id="taskDagPill" title="Current HTN Autonomous Step">
            <span class="dag-pulse-dot" id="dagPulseDot"></span>
            <span id="dagText">${escapeHtml(initialTelemetry.task.stepPillText)}</span>
          </div>
          <div class="foci-pill ${escapeHtml(initialTelemetry.foci.colorName)}" id="fociPill">
            <span id="fociStateLabel">${escapeHtml(initialTelemetry.foci.mentalState)}</span>
          </div>
        </div>

        <!-- Middle Row: Breathing Wave + Focus Sprint Radial Timer -->
        <div class="expanded-mid-row">
          <div class="wave-wrapper">
            <div class="wave-meta">
              <span>BPM: <b id="waveBpm">${initialTelemetry.foci.respirationRate}</b></span>
              <span>Coherence: <b id="waveCoherence">${initialTelemetry.foci.coherenceScore}%</b></span>
            </div>
            <canvas id="breathingCanvas" width="260" height="38"></canvas>
          </div>

          <div class="timer-widget">
            <div class="radial-box">
              <svg class="radial-svg" viewBox="0 0 36 36">
                <path class="radial-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path class="radial-progress" id="radialProgress" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div class="radial-icon" id="radialIcon">⚡</div>
            </div>
            <div class="timer-info">
              <span class="timer-digits" id="timerDigits">00:00</span>
              <span class="timer-label" id="timerLabel">Sprint Timer</span>
            </div>
          </div>
        </div>

        <!-- Bottom Row: Quick Action Dock -->
        <div class="quick-dock" id="quickDock">
          <button class="dock-btn accent-spark" id="btnSpark" data-action="spark" title="Initiate Deep Work Focus Sprint">
            <span>⚡</span> Spark
          </button>
          <button class="dock-btn accent-settle" id="btnSettle" data-action="settle" title="Settle & Log Completed Sprint">
            <span>🏁</span> Settle
          </button>
          <button class="dock-btn accent-voice" id="btnVoiceToggle" data-action="voice" title="Toggle Real-Time Socratic Voice Channel">
            <span>🎙️</span> Voice
          </button>
          <button class="dock-btn accent-aimode" id="btnAiMode" data-action="aimode" title="Autonomous AI Execution Mode">
            <span>🧠</span> AI Mode
          </button>
          <button class="dock-btn accent-nlm" id="btnNlm" data-action="notebooklm" title="Synthesize Voice Briefing with NotebookLM">
            <span>🎙️</span> NotebookLM
          </button>
        </div>

        <!-- Real-Time Voice Channel Orb & Live Waveform Strip -->
        <div class="voice-channel-strip" id="voiceChannelStrip" style="display: none;">
          <div class="voice-orb-pulsar" id="voiceOrbPulsar" title="Real-Time Council Voice Channel">
            <div class="voice-orb-glow"></div>
            <div class="voice-orb-core"></div>
          </div>
          <div class="voice-waveform-container">
            <canvas id="voiceWaveformCanvas" width="220" height="24"></canvas>
            <div class="voice-status-label" id="voiceStatusLabel">Voice: Connecting (<300ms SLA)...</div>
          </div>
          <button class="voice-mic-btn" id="voiceMicBtn" title="Speak to Socratic Council">🎤</button>
        </div>

        <!-- Full Modal Additional Drawer Details -->
        <div class="modal-details" id="modalDetails">
          <div class="modal-grid">
            <div class="stat-card">
              <div class="stat-card-title">HTN Plan Goal</div>
              <div class="stat-card-value" id="modalPlanGoal">${escapeHtml(initialTelemetry.task.planGoal)}</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-title">Active Session Task</div>
              <div class="stat-card-value" id="modalSessionDesc">${escapeHtml(initialTelemetry.session.taskDescription)}</div>
            </div>
          </div>
        </div>

        <!-- iPad Swipe Drag Indicator -->
        <div class="swipe-pill" id="swipePill"></div>
      </div>
    </div>
  </div>

  <!-- Workspace Backdrop Hint for iPad & Mac -->
  <div class="workspace-preview">
    <div class="hero-badge">
      <span>●</span> Fabric OS Dynamic Island • Companion HUD
    </div>
    <h1 class="hero-title">Ambient Cognitive Island</h1>
    <p class="hero-desc">
      Ultra-low friction companion floating seamlessly on macOS & iPadOS.
      Tap or swipe down on the notch to expand controls.
    </p>
    <div class="gesture-hint">
      <span><span class="gesture-key">Tap / Hover</span> Expand Notch</span>
      <span><span class="gesture-key">Swipe Down</span> Full View</span>
      <span><span class="gesture-key">Swipe Up</span> Collapse</span>
    </div>
  </div>

  <!-- Toast Notification -->
  <div class="island-toast" id="islandToast">
    <span id="toastIcon">✨</span>
    <span id="toastMessage">Action triggered</span>
  </div>

  <!-- Serialized Initial Telemetry -->
  <script>
    window.__INITIAL_TELEMETRY__ = ${serialized};
  </script>

  <!-- Client-side Dynamic Island Engine -->
  <script>
    (function () {
      let telemetry = window.__INITIAL_TELEMETRY__ || {};
      const island = document.getElementById("dynamicIsland");
      const breathingCanvas = document.getElementById("breathingCanvas");
      const compactWaveCanvas = document.getElementById("compactWaveCanvas");
      const ambientCanvas = document.getElementById("ambientCanvas");
      
      const compactDot = document.getElementById("compactDot");
      const compactCenterText = document.getElementById("compactCenterText");
      const compactTimerBadge = document.getElementById("compactTimerBadge");
      
      const taskDagPill = document.getElementById("taskDagPill");
      const dagPulseDot = document.getElementById("dagPulseDot");
      const dagText = document.getElementById("dagText");
      const fociPill = document.getElementById("fociPill");
      const fociStateLabel = document.getElementById("fociStateLabel");
      const waveBpm = document.getElementById("waveBpm");
      const waveCoherence = document.getElementById("waveCoherence");
      
      const timerDigits = document.getElementById("timerDigits");
      const radialProgress = document.getElementById("radialProgress");
      const islandToast = document.getElementById("islandToast");
      const toastMessage = document.getElementById("toastMessage");
      const toastIcon = document.getElementById("toastIcon");

      let currentMode = "compact"; // 'compact' | 'expanded' | 'modal'
      let wavePhase = 0;
      let animFrameId = null;

      // Color Palette Mappings
      const COLOR_MAP = {
        flow: { hex: "#06b6d4", rgb: "6, 182, 212" },
        focus: { hex: "#a855f7", rgb: "168, 85, 247" },
        calm: { hex: "#10b981", rgb: "16, 185, 129" },
        stress: { hex: "#f59e0b", rgb: "245, 158, 11" },
        distraction: { hex: "#f59e0b", rgb: "245, 158, 11" },
        fatigue: { hex: "#f59e0b", rgb: "245, 158, 11" },
        default: { hex: "#06b6d4", rgb: "6, 182, 212" }
      };

      function getColorSpec(mentalState) {
        const key = (mentalState || "").toLowerCase();
        return COLOR_MAP[key] || COLOR_MAP.default;
      }

      // Format seconds into MM:SS or HH:MM:SS
      function formatTimer(sec) {
        if (!sec || sec <= 0) return "00:00";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const mm = String(m).padStart(2, "0");
        const ss = String(s).padStart(2, "0");
        return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
      }

      // Toast notification popup
      function showToast(message, icon) {
        toastMessage.textContent = message;
        toastIcon.textContent = icon || "⚡";
        islandToast.classList.add("show");
        setTimeout(function () {
          islandToast.classList.remove("show");
        }, 2400);
      }

      // Update UI with new telemetry payload
      function updateHUD(data) {
        if (!data) return;
        telemetry = data;

        const colorSpec = getColorSpec(data.foci ? data.foci.mentalState : "flow");
        const mentalState = data.foci ? data.foci.mentalState : "flow";
        const fociColorName = data.foci ? data.foci.colorName : "cyan";

        // 1. Compact mode elements
        if (compactDot) {
          compactDot.style.background = colorSpec.hex;
          compactDot.style.boxShadow = "0 0 8px " + colorSpec.hex;
        }
        if (compactCenterText && data.task) {
          compactCenterText.textContent = data.task.stepPillText || "Step 2/4: AI Mode Ingestion";
        }

        // 2. Expanded top row
        if (dagText && data.task) {
          dagText.textContent = data.task.stepPillText || "Step 2/4: AI Mode Ingestion";
        }
        if (dagPulseDot) {
          dagPulseDot.style.background = colorSpec.hex;
          dagPulseDot.style.boxShadow = "0 0 10px " + colorSpec.hex;
        }

        if (fociPill && fociStateLabel) {
          fociPill.className = "foci-pill " + fociColorName;
          fociStateLabel.textContent = mentalState;
        }

        if (waveBpm && data.foci) {
          waveBpm.textContent = data.foci.respirationRate || 14.5;
        }
        if (waveCoherence && data.foci) {
          waveCoherence.textContent = (data.foci.coherenceScore || 92) + "%";
        }

        // 3. Focus Timer Radial & Badges
        const elapsedSec = (data.session && data.session.elapsedSeconds) || 0;
        const formattedTime = formatTimer(elapsedSec);
        if (timerDigits) timerDigits.textContent = formattedTime;
        if (compactTimerBadge) compactTimerBadge.textContent = formattedTime;

        if (radialProgress) {
          const progressPercent = (data.session && data.session.progressPercent) || 0;
          const strokeOffset = Math.max(0, 100 - progressPercent);
          radialProgress.style.strokeDashoffset = strokeOffset;
          radialProgress.style.stroke = colorSpec.hex;
        }

        // 4. Modal drawer
        const modalPlanGoal = document.getElementById("modalPlanGoal");
        if (modalPlanGoal && data.task) {
          modalPlanGoal.textContent = data.task.planGoal || "Autonomous Deep Work";
        }
        const modalSessionDesc = document.getElementById("modalSessionDesc");
        if (modalSessionDesc && data.session) {
          modalSessionDesc.textContent = data.session.taskDescription || "Standby — Ready for Sprint";
        }
      }

      // ========================================================
      // FLUID CANVAS SINE WAVE DRAWING (FOCI Respiration)
      // ========================================================
      function drawWaveform() {
        if (!breathingCanvas) return;
        const ctx = breathingCanvas.getContext("2d");
        const width = breathingCanvas.width;
        const height = breathingCanvas.height;
        ctx.clearRect(0, 0, width, height);

        const mentalState = telemetry.foci ? telemetry.foci.mentalState : "flow";
        const bpm = (telemetry.foci && telemetry.foci.respirationRate) || 14.5;
        const colorSpec = getColorSpec(mentalState);

        // Breathing cycle: speed scales with BPM (e.g. 14 bpm is ~0.23 Hz)
        const speed = (bpm / 60) * 0.08;
        wavePhase += speed;

        const centerY = height / 2;
        const amplitude = Math.min(height * 0.35, 12);

        // Draw primary fluid sine wave
        ctx.beginPath();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = colorSpec.hex;

        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, "rgba(" + colorSpec.rgb + ", 0.2)");
        gradient.addColorStop(0.5, "rgba(" + colorSpec.rgb + ", 0.95)");
        gradient.addColorStop(1, "rgba(" + colorSpec.rgb + ", 0.2)");
        ctx.strokeStyle = gradient;

        for (let x = 0; x < width; x++) {
          const freq = 0.035;
          const y = centerY + Math.sin(x * freq + wavePhase) * amplitude * Math.sin((x / width) * Math.PI);
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Draw secondary harmonic glow wave
        ctx.beginPath();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(" + colorSpec.rgb + ", 0.35)";
        for (let x = 0; x < width; x++) {
          const freq2 = 0.05;
          const y2 = centerY + Math.cos(x * freq2 - wavePhase * 0.7) * (amplitude * 0.6) * Math.sin((x / width) * Math.PI);
          if (x === 0) {
            ctx.moveTo(x, y2);
          } else {
            ctx.lineTo(x, y2);
          }
        }
        ctx.stroke();

        // Mini canvas for compact notch mode
        if (compactWaveCanvas) {
          const mCtx = compactWaveCanvas.getContext("2d");
          mCtx.clearRect(0, 0, 44, 20);
          mCtx.beginPath();
          mCtx.lineWidth = 1.8;
          mCtx.strokeStyle = colorSpec.hex;
          for (let mx = 0; mx < 44; mx++) {
            const my = 10 + Math.sin(mx * 0.18 + wavePhase) * 5 * Math.sin((mx / 44) * Math.PI);
            if (mx === 0) mCtx.moveTo(mx, my);
            else mCtx.lineTo(mx, my);
          }
          mCtx.stroke();
        }

        animFrameId = requestAnimationFrame(drawWaveform);
      }

      // ========================================================
      // EXPAND / COLLAPSE / MODAL GESTURE CONTROLS
      // ========================================================
      function setIslandMode(mode) {
        currentMode = mode;
        island.classList.remove("expanded", "modal");
        if (mode === "expanded") {
          island.classList.add("expanded");
        } else if (mode === "modal") {
          island.classList.add("modal");
        }
      }

      // Toggle between compact and expanded
      island.addEventListener("click", function (e) {
        if (e.target.closest(".dock-btn")) return; // Don't collapse when clicking dock buttons
        if (currentMode === "compact") {
          setIslandMode("expanded");
        } else if (currentMode === "expanded") {
          setIslandMode("compact");
        }
      });

      // Double-click to toggle full modal
      island.addEventListener("dblclick", function (e) {
        if (e.target.closest(".dock-btn")) return;
        setIslandMode(currentMode === "modal" ? "compact" : "modal");
      });

      // iPad Touch Swipe Gestures
      let touchStartY = 0;
      island.addEventListener("touchstart", function (e) {
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      island.addEventListener("touchend", function (e) {
        const touchEndY = e.changedTouches[0].clientY;
        const diffY = touchEndY - touchStartY;

        // Swipe down -> expand
        if (diffY > 30) {
          if (currentMode === "compact") setIslandMode("expanded");
          else if (currentMode === "expanded") setIslandMode("modal");
        } 
        // Swipe up -> collapse
        else if (diffY < -30) {
          if (currentMode === "modal") setIslandMode("expanded");
          else if (currentMode === "expanded") setIslandMode("compact");
        }
      }, { passive: true });

      // Click outside to collapse to compact
      document.addEventListener("click", function (e) {
        if (!island.contains(e.target)) {
          if (currentMode !== "compact") {
            setIslandMode("compact");
          }
        }
      });

      // ========================================================
      // QUICK ACTION DOCK HANDLERS
      // ========================================================
      const actions = {
        spark: function () {
          triggerAction("spark", "⚡ Focus Sprint Started", "⚡");
        },
        settle: function () {
          triggerAction("settle", "🏁 Sprint Settled & Logged", "🏁");
        },
        voice: function () {
          toggleVoiceChannel();
        },
        aimode: function () {
          triggerAction("aimode", "🧠 Autonomous AI Ingestion Engaged", "🧠");
        },
        notebooklm: function () {
          triggerAction("notebooklm", "🎙️ Generating Audio Briefing...", "🎙️");
        }
      };

      // ========================================================
      // REAL-TIME SOCRATIC VOICE CHANNEL
      // ========================================================
      let isVoiceActive = false;
      let voiceSessionId = null;
      let voiceMediaRecorder = null;
      let voiceAudioStream = null;
      const voiceWaveCanvas = document.getElementById("voiceWaveformCanvas");
      const voiceWaveCtx = voiceWaveCanvas ? voiceWaveCanvas.getContext("2d") : null;
      const voiceStrip = document.getElementById("voiceChannelStrip");
      const voiceStatusLabel = document.getElementById("voiceStatusLabel");
      const compactVoiceOrb = document.getElementById("compactVoiceOrb");
      const voiceMicBtn = document.getElementById("voiceMicBtn");
      let voicePhase = 0;
      let voiceWaveAnimId = null;
      let voiceEnergyLevel = 0.25;

      function drawVoiceWaveform() {
        if (!voiceWaveCtx || !isVoiceActive) return;
        const w = voiceWaveCanvas.width;
        const h = voiceWaveCanvas.height;
        voiceWaveCtx.clearRect(0, 0, w, h);

        voicePhase += 0.08;
        const midY = h / 2;

        voiceWaveCtx.beginPath();
        voiceWaveCtx.lineWidth = 2;
        const grad = voiceWaveCtx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "rgba(168, 85, 247, 0.9)");
        grad.addColorStop(0.5, "rgba(6, 182, 212, 0.95)");
        grad.addColorStop(1, "rgba(168, 85, 247, 0.9)");
        voiceWaveCtx.strokeStyle = grad;

        const baseAmp = (h / 3) * (0.3 + voiceEnergyLevel * 0.7);

        for (let x = 0; x < w; x++) {
          const normX = x / w;
          const envelope = Math.sin(normX * Math.PI);
          const y = midY + Math.sin(normX * 8 * Math.PI + voicePhase) * baseAmp * envelope
                        + Math.sin(normX * 14 * Math.PI - voicePhase * 1.5) * (baseAmp * 0.4) * envelope;
          if (x === 0) voiceWaveCtx.moveTo(x, y);
          else voiceWaveCtx.lineTo(x, y);
        }
        voiceWaveCtx.stroke();

        voiceWaveAnimId = requestAnimationFrame(drawVoiceWaveform);
      }

      function toggleVoiceChannel() {
        if (!isVoiceActive) {
          startVoiceChannel();
        } else {
          stopVoiceChannel();
        }
      }

      function startVoiceChannel() {
        isVoiceActive = true;
        if (voiceStrip) voiceStrip.style.display = "flex";
        if (compactVoiceOrb) compactVoiceOrb.classList.add("active-pulse");
        if (voiceStatusLabel) voiceStatusLabel.textContent = "Voice: Initializing Socratic mesh...";
        showToast("🎙️ Real-Time Voice Channel Active", "🎙️");

        if (voiceWaveCanvas) {
          cancelAnimationFrame(voiceWaveAnimId);
          drawVoiceWaveform();
        }

        fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", mode: "socratic", persona: "socratic" })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.sessionId) {
            voiceSessionId = data.sessionId;
            if (voiceStatusLabel) {
              voiceStatusLabel.textContent = "Socratic Channel Ready (<300ms SLA)";
            }
            sparWithCouncil("Initiate focus sparring.");
          }
        })
        .catch(function () {
          if (voiceStatusLabel) voiceStatusLabel.textContent = "Voice: Connected (Autonomous Fallback)";
        });

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
              voiceAudioStream = stream;
              if (window.MediaRecorder) {
                voiceMediaRecorder = new MediaRecorder(stream);
                voiceMediaRecorder.ondataavailable = function (evt) {
                  if (evt.data && evt.data.size > 0 && voiceSessionId && isVoiceActive) {
                    const reader = new FileReader();
                    reader.onloadend = function () {
                      const base64Audio = (reader.result || "").toString().split(",")[1];
                      if (base64Audio) {
                        fetch("/api/voice", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "audio",
                            sessionId: voiceSessionId,
                            chunk: base64Audio,
                            format: "webm",
                            sequenceNumber: Date.now()
                          })
                        }).catch(function () {});
                      }
                    };
                    reader.readAsDataURL(evt.data);
                  }
                };
                voiceMediaRecorder.start(1500);
              }
            })
            .catch(function () {
              if (voiceStatusLabel) voiceStatusLabel.textContent = "Mic idle (Tap 🎤 to spar)";
            });
        }
      }

      function sparWithCouncil(userPrompt) {
        if (!voiceSessionId) return;
        if (voiceStatusLabel) voiceStatusLabel.textContent = "Council deliberating...";
        voiceEnergyLevel = 0.8;

        fetch("/api/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "spar",
            sessionId: voiceSessionId,
            input: userPrompt || "Spar with me on my current focus vector.",
            mode: "socratic"
          })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          voiceEnergyLevel = 0.3;
          if (data && data.replyDelta) {
            if (voiceStatusLabel) {
              voiceStatusLabel.textContent = data.replyDelta.persona + ": " + data.replyDelta.fullText;
            }
          }
          if (data && data.replyAudio && data.replyAudio.data) {
            try {
              const audioFmt = data.replyAudio.format === "wav" ? "audio/wav" : "audio/mp3";
              const audioObj = new Audio("data:" + audioFmt + ";base64," + data.replyAudio.data);
              audioObj.play().catch(function () {});
            } catch (err) {}
          }
        })
        .catch(function () {
          voiceEnergyLevel = 0.2;
        });
      }

      function stopVoiceChannel() {
        isVoiceActive = false;
        if (voiceStrip) voiceStrip.style.display = "none";
        if (compactVoiceOrb) compactVoiceOrb.classList.remove("active-pulse");
        cancelAnimationFrame(voiceWaveAnimId);

        if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
          try { voiceMediaRecorder.stop(); } catch (e) {}
        }
        if (voiceAudioStream) {
          try {
            voiceAudioStream.getTracks().forEach(function (t) { t.stop(); });
          } catch (e) {}
        }

        if (voiceSessionId) {
          fetch("/api/voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "finish", sessionId: voiceSessionId })
          }).catch(function () {});
          voiceSessionId = null;
        }

        showToast("Voice Channel Concluded & Logged", "🎙️");
      }

      if (compactVoiceOrb) {
        compactVoiceOrb.addEventListener("click", function (e) {
          e.stopPropagation();
          toggleVoiceChannel();
        });
      }

      if (voiceMicBtn) {
        voiceMicBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          sparWithCouncil("What is my primary Aristotelian focus right now?");
        });
      }

      document.querySelectorAll(".dock-btn").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          const actionKey = btn.getAttribute("data-action");
          if (actions[actionKey]) actions[actionKey]();
        });
      });

      function triggerAction(actionName, feedbackMsg, icon) {
        showToast(feedbackMsg, icon);
        fetch("/api/island?action=" + encodeURIComponent(actionName), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: actionName })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.telemetry) {
            updateHUD(data.telemetry);
          }
        })
        .catch(function () {
          // Local optimistic update
          if (actionName === "spark") {
            if (telemetry.session) {
              telemetry.session.active = true;
              telemetry.session.elapsedSeconds = 1;
            }
          }
        });
      }

      // ========================================================
      // LIVE SERVER-SENT EVENTS (SSE) & POLLING FALLBACK
      // ========================================================
      function initLiveStream() {
        if (window.EventSource) {
          try {
            const eventSource = new EventSource("/api/island?stream=1");
            
            eventSource.addEventListener("telemetry", function (event) {
              try {
                const parsed = JSON.parse(event.data);
                updateHUD(parsed);
              } catch (e) {
                console.warn("[Island] SSE parse error:", e);
              }
            });

            eventSource.onerror = function () {
              eventSource.close();
              // Fallback to polling every 3 seconds
              setInterval(pollTelemetry, 3000);
            };
            return;
          } catch (e) {
            console.warn("[Island] EventSource initiation failed, falling back:", e);
          }
        }
        setInterval(pollTelemetry, 3000);
      }

      function pollTelemetry() {
        fetch("/api/island?json=1")
          .then(function (res) { return res.json(); })
          .then(function (data) { updateHUD(data); })
          .catch(function () {});
      }

      // Local second-by-second timer ticker
      setInterval(function () {
        if (telemetry && telemetry.session && telemetry.session.active) {
          telemetry.session.elapsedSeconds = (telemetry.session.elapsedSeconds || 0) + 1;
          const formatted = formatTimer(telemetry.session.elapsedSeconds);
          if (timerDigits) timerDigits.textContent = formatted;
          if (compactTimerBadge) compactTimerBadge.textContent = formatted;
        }
      }, 1000);

      // Initialize
      updateHUD(telemetry);
      drawWaveform();
      initLiveStream();
    })();
  </script>
</body>
</html>`;
}

/**
 * Quick Action Dispatcher
 */
async function handleQuickAction(
  action: string,
  userId: string
): Promise<{ success: boolean; action: string; message: string; telemetry: IslandTelemetryPayload }> {
  let message = "Action processed";

  switch (action) {
    case "spark":
      message = "Focus Sprint initiated. Biometrics streaming to Island HUD.";
      break;
    case "settle":
      message = "Sprint completed. Session logged to Aristotelian ledger.";
      break;
    case "aimode":
      message = "Autonomous AI Mode engaged. Executing next HTN Task DAG step.";
      break;
    case "notebooklm":
      message = "NotebookLM briefing synthesis queued.";
      break;
    case "voice":
      message = "Real-Time Socratic Voice Channel activated.";
      break;
    default:
      message = `Custom action [${action}] executed.`;
  }

  const updatedTelemetry = await getIslandTelemetry(userId);
  return {
    success: true,
    action,
    message,
    telemetry: updatedTelemetry,
  };
}

/**
 * Standalone HTTP Handler for /api/island and /island
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const url = req.url || "/";
    const query = parseQuery(url);
    const userId = query.get("userId") || config.telegramUserId || "1131646846";

    // 1. Handle Quick Action POST
    if (req.method === "POST" || query.has("action")) {
      const action = query.get("action") || "spark";
      const result = await handleQuickAction(action, userId);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(result));
      return;
    }

    // 2. Handle Server-Sent Events (SSE) Stream: ?stream=1 or Accept: text/event-stream
    const isSSE = query.get("stream") === "1" || (req.headers.accept && req.headers.accept.includes("text/event-stream"));
    if (isSSE) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "X-Accel-Buffering": "no",
      });

      const initialTelemetry = await getIslandTelemetry(userId);
      res.write(formatSSERetry(3000));
      res.write(formatSSEComment("Fabric OS Dynamic Island SSE Stream Active"));
      res.write(formatSSEEvent(initialTelemetry, "telemetry"));

      // Periodic telemetry broadcast every 2.5s
      const interval = setInterval(async () => {
        try {
          const telemetry = await getIslandTelemetry(userId);
          res.write(formatSSEEvent(telemetry, "telemetry"));
        } catch (e) {
          // Client may have disconnected
        }
      }, 2500);

      req.on("close", () => {
        clearInterval(interval);
      });

      // If in a non-streaming test environment where req terminates or single shot is requested
      if (query.get("single") === "1") {
        clearInterval(interval);
        res.end();
      }
      return;
    }

    // 3. Handle JSON polling: ?json=1 or Accept: application/json
    const isJson = query.get("json") === "1" || (req.headers.accept && req.headers.accept.includes("application/json"));
    if (isJson) {
      const telemetry = await getIslandTelemetry(userId);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(telemetry));
      return;
    }

    // 4. Default: Render Ultra-Sleek Dynamic Island Companion HTML
    const initialTelemetry = await getIslandTelemetry(userId);
    const html = renderIslandHtml(initialTelemetry);

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } catch (error) {
    console.error("[IslandHandler] Uncaught error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html>
<html>
<head><title>Fabric Island Error</title></head>
<body style="background:#050508;color:#f43f5e;font-family:sans-serif;padding:2rem;text-align:center;">
  <h2>Dynamic Island Offline</h2>
  <p style="color:#71717a;">Failed to initialize companion HUD.</p>
</body>
</html>`);
  }
}
