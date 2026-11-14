/**
 * Fabric OS — Google Calendar & Time-Blocking Service
 * Manages calendar events, focus sprint scheduling, ambient time tracking,
 * and AppleScript / Google Calendar API v3 synchronization.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export type CalendarEventCategory =
  | "focus"
  | "trade"
  | "study"
  | "break"
  | "sparring"
  | "review";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  category: CalendarEventCategory;
  source: "google_calendar" | "macos_calendar" | "local_store";
  syncStatus: "pending" | "synced" | "notion_logged";
  notionPageId?: string;
  metadata?: {
    focusHours?: number;
    fourFDelta?: Record<string, number>;
    tags?: string[];
    sourceModule?: string;
  };
  createdAt: string;
}

export interface TimeBlockRequest {
  title: string;
  durationMinutes: number;
  startTime?: Date | string;
  description?: string;
  category?: CalendarEventCategory;
  tags?: string[];
  syncToNotion?: boolean;
}

export interface TimeTrackRecordRequest {
  title: string;
  durationMinutes: number;
  category?: CalendarEventCategory;
  notes?: string;
  takeaway?: string;
  tags?: string[];
  focusHours?: number;
  syncToNotion?: boolean;
}

const CALENDAR_STORE_FILE = path.resolve(process.cwd(), "data/calendar_events.json");

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export class FabricCalendarService {
  private events: CalendarEvent[] = [];
  private storeFile: string;

  constructor(storeFile: string = CALENDAR_STORE_FILE) {
    this.storeFile = storeFile;
    this.loadEvents();
  }

  private loadEvents(): void {
    try {
      if (fs.existsSync(this.storeFile)) {
        const raw = fs.readFileSync(this.storeFile, "utf-8");
        this.events = JSON.parse(raw);
      }
    } catch {
      this.events = [];
    }
  }

  private persistEvents(): void {
    ensureDirectoryExists(this.storeFile);
    fs.writeFileSync(this.storeFile, JSON.stringify(this.events, null, 2), "utf-8");
  }

  /**
   * Schedules a time block on the user's calendar (macOS AppleScript / Google Calendar API / local store).
   */
  public async blockTime(request: TimeBlockRequest): Promise<CalendarEvent> {
    const start = request.startTime ? new Date(request.startTime) : new Date();
    const end = new Date(start.getTime() + request.durationMinutes * 60 * 1000);
    const category = request.category || "focus";
    const eventId = `cal_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

    let source: CalendarEvent["source"] = "local_store";

    // 1. Attempt AppleScript insertion if running on macOS (and not in unit tests)
    if (process.platform === "darwin" && process.env.NODE_ENV !== "test") {
      try {
        await this.insertAppleScriptEvent(request.title, start, end, request.description);
        source = "macos_calendar";
      } catch (err) {
        // Fall back gracefully to local store if AppleScript Calendar permissions are not granted
      }
    }

    // 2. Attempt Google Calendar REST API insertion if credentials are configured
    const gcalToken = process.env.GOOGLE_CALENDAR_TOKEN || process.env.GOOGLE_CALENDAR_API_KEY;
    const gcalId = process.env.GOOGLE_CALENDAR_ID || "primary";
    if (gcalToken) {
      try {
        await this.insertGoogleCalendarEvent(gcalToken, gcalId, {
          title: request.title,
          start,
          end,
          description: request.description,
        });
        source = "google_calendar";
      } catch (err) {
        // Fall back to macos_calendar or local_store
      }
    }

    const event: CalendarEvent = {
      id: eventId,
      title: request.title,
      description: request.description,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      category,
      source,
      syncStatus: "pending",
      metadata: {
        focusHours: request.durationMinutes / 60,
        tags: request.tags || ["focus-block", category],
      },
      createdAt: new Date().toISOString(),
    };

    this.events.unshift(event);
    this.persistEvents();

    return event;
  }

  /**
   * Tracks and logs completed time (e.g. from /spark sprint, trade settlement, or ambient work).
   */
  public async trackTime(request: TimeTrackRecordRequest): Promise<CalendarEvent> {
    const end = new Date();
    const start = new Date(end.getTime() - request.durationMinutes * 60 * 1000);
    const eventId = `trk_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const category = request.category || "focus";

    const event: CalendarEvent = {
      id: eventId,
      title: `[Completed] ${request.title}`,
      description: request.notes || request.takeaway,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      category,
      source: "local_store",
      syncStatus: "pending",
      metadata: {
        focusHours: request.focusHours ?? request.durationMinutes / 60,
        tags: request.tags || ["time-tracked", category],
      },
      createdAt: new Date().toISOString(),
    };

    this.events.unshift(event);
    this.persistEvents();

    return event;
  }

  /**
   * Lists scheduled and tracked calendar events within an optional time range.
   */
  public listEvents(options: {
    timeMin?: Date | string;
    timeMax?: Date | string;
    category?: CalendarEventCategory;
    limit?: number;
  } = {}): CalendarEvent[] {
    let result = [...this.events];

    if (options.timeMin) {
      const minIso = new Date(options.timeMin).toISOString();
      result = result.filter((e) => e.startTime >= minIso);
    }

    if (options.timeMax) {
      const maxIso = new Date(options.timeMax).toISOString();
      result = result.filter((e) => e.startTime <= maxIso);
    }

    if (options.category) {
      result = result.filter((e) => e.category === options.category);
    }

    if (options.limit && options.limit > 0) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * Updates an event's sync status (e.g. after syncing to Notion).
   */
  public updateSyncStatus(eventId: string, status: CalendarEvent["syncStatus"], notionPageId?: string): boolean {
    const event = this.events.find((e) => e.id === eventId);
    if (!event) return false;

    event.syncStatus = status;
    if (notionPageId) {
      event.notionPageId = notionPageId;
    }
    this.persistEvents();
    return true;
  }

  /**
   * macOS AppleScript Calendar insertion.
   */
  private async insertAppleScriptEvent(
    title: string,
    start: Date,
    end: Date,
    notes?: string
  ): Promise<void> {
    const cleanTitle = title.replace(/"/g, '\\"');
    const cleanNotes = (notes || "").replace(/"/g, '\\"');

    // AppleScript date format: month/day/year hours:minutes:seconds AM/PM
    const formatAppleDate = (d: Date) => {
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const y = d.getFullYear();
      let h = d.getHours();
      const min = d.getMinutes().toString().padStart(2, "0");
      const sec = d.getSeconds().toString().padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      return `${m}/${day}/${y} ${h}:${min}:${sec} ${ampm}`;
    };

    const startDateStr = formatAppleDate(start);
    const endDateStr = formatAppleDate(end);

    const script = `
      tell application "Calendar"
        set targetCal to first calendar
        tell targetCal
          make new event at end with properties {summary:"${cleanTitle}", start date:date "${startDateStr}", end date:date "${endDateStr}", description:"${cleanNotes}"}
        end tell
      end tell
    `;

    await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 4000 });
  }

  /**
   * Google Calendar v3 REST API event insertion.
   */
  private async insertGoogleCalendarEvent(
    token: string,
    calendarId: string,
    params: { title: string; start: Date; end: Date; description?: string }
  ): Promise<any> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: params.title,
        description: params.description,
        start: { dateTime: params.start.toISOString() },
        end: { dateTime: params.end.toISOString() },
      }),
    });

    if (!res.ok) {
      throw new Error(`Google Calendar API responded with status ${res.status}`);
    }

    return await res.json();
  }
}

export const defaultCalendarService = new FabricCalendarService();
