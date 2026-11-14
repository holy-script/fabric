/**
 * Fabric OS — Calendar to Notion Synchronization Bridge
 * Syncs scheduled time blocks, focus sprints, and completed time-tracking records
 * directly into the operator's Notion database with 4F metadata and takeaways.
 */

import {
  isNotionConfigured,
  syncKnowledgeItemToNotion,
} from "../notion/client.js";
import {
  defaultCalendarService,
  FabricCalendarService,
  type CalendarEvent,
} from "./calendar.js";
import type { KnowledgeItem } from "../db/types.js";

export interface SyncCalendarNotionResult {
  syncedCount: number;
  failedCount: number;
  events: Array<{
    eventId: string;
    title: string;
    notionUrl?: string;
    error?: string;
  }>;
}

export class CalendarNotionSyncBridge {
  private calendar: FabricCalendarService;

  constructor(calendar: FabricCalendarService = defaultCalendarService) {
    this.calendar = calendar;
  }

  /**
   * Syncs a single calendar event into Notion as a structured activity/strategy item.
   */
  public async syncEventToNotion(event: CalendarEvent): Promise<{ id: string; url: string }> {
    if (!isNotionConfigured()) {
      throw new Error("Notion is not configured. Missing NOTION_API_KEY or NOTION_DATABASE_ID.");
    }

    const durationMin = Math.round(
      (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / (60 * 1000)
    );

    const tags = Array.from(
      new Set([
        "calendar",
        event.category,
        ...(event.metadata?.tags || []),
        `${durationMin}m`,
      ])
    );

    const knowledgeItem: KnowledgeItem = {
      userId: "operator",
      title: event.title,
      category: event.category === "study" ? "insight" : event.category === "trade" ? "win" : "strategy",
      tags,
      content: [
        `**Session Type:** ${event.category.toUpperCase()}`,
        `**Scheduled Window:** ${event.startTime} -> ${event.endTime}`,
        `**Duration:** ${durationMin} minutes (${(durationMin / 60).toFixed(1)}h)`,
        `**Calendar Source:** ${event.source}`,
        event.description ? `\n**Description / Notes:**\n${event.description}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      actionableTakeaway:
        event.description ||
        `Dedicated ${durationMin}m ${event.category} block executed under Fabric OS governance.`,
      timestamp: new Date(event.startTime),
    };

    const res = await syncKnowledgeItemToNotion(knowledgeItem);

    // Update calendar event record with Notion page ID and synced status
    this.calendar.updateSyncStatus(event.id, "notion_logged", res.id);

    return res;
  }

  /**
   * Syncs all pending calendar events into Notion in batch.
   */
  public async syncPendingEvents(): Promise<SyncCalendarNotionResult> {
    const pendingEvents = this.calendar
      .listEvents()
      .filter((e) => e.syncStatus === "pending");

    const result: SyncCalendarNotionResult = {
      syncedCount: 0,
      failedCount: 0,
      events: [],
    };

    for (const event of pendingEvents) {
      try {
        const res = await this.syncEventToNotion(event);
        result.syncedCount++;
        result.events.push({
          eventId: event.id,
          title: event.title,
          notionUrl: res.url,
        });
      } catch (err: any) {
        result.failedCount++;
        result.events.push({
          eventId: event.id,
          title: event.title,
          error: err.message || String(err),
        });
      }
    }

    return result;
  }
}

export const defaultCalendarNotionBridge = new CalendarNotionSyncBridge();
