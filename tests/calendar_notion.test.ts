import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import {
  FabricCalendarService,
  type CalendarEvent,
} from "../src/services/calendar.js";
import {
  CalendarNotionSyncBridge,
} from "../src/services/calendar-notion-sync.js";
import handler from "../api/calendar.js";

const TEST_STORE = path.resolve(
  process.cwd(),
  `data/test_calendar_events_${Date.now()}.json`
);

describe("Fabric OS — Google Calendar & Notion Time-Blocking QC Suite", () => {
  let calendar: FabricCalendarService;
  let syncBridge: CalendarNotionSyncBridge;

  beforeEach(() => {
    calendar = new FabricCalendarService(TEST_STORE);
    syncBridge = new CalendarNotionSyncBridge(calendar);
  });

  afterEach(() => {
    if (fs.existsSync(TEST_STORE)) {
      try {
        fs.unlinkSync(TEST_STORE);
      } catch {}
    }
  });

  describe("1. Calendar Time Blocking & Scheduling", () => {
    it("schedules a 45-minute focus time block with ISO dates", async () => {
      const event = await calendar.blockTime({
        title: "Deep Work: HTN Swarm Optimizations",
        durationMinutes: 45,
        category: "focus",
        description: "Refactor multi-agent pipeline and token interpolation",
        tags: ["htn", "swarm", "agents"],
      });

      expect(event.id).toStartWith("cal_");
      expect(event.title).toBe("Deep Work: HTN Swarm Optimizations");
      expect(event.category).toBe("focus");
      expect(event.syncStatus).toBe("pending");
      expect(event.metadata?.focusHours).toBe(0.75);

      const start = new Date(event.startTime).getTime();
      const end = new Date(event.endTime).getTime();
      expect(end - start).toBe(45 * 60 * 1000);
    });

    it("persists scheduled blocks across service re-instantiation", async () => {
      await calendar.blockTime({
        title: "IITM Study Block: Computer Networks",
        durationMinutes: 90,
        category: "study",
      });

      const reloadedCalendar = new FabricCalendarService(TEST_STORE);
      const events = reloadedCalendar.listEvents();
      expect(events.length).toBe(1);
      expect(events[0].title).toBe("IITM Study Block: Computer Networks");
      expect(events[0].category).toBe("study");
    });
  });

  describe("2. Completed Time Tracking & Ambient Logging", () => {
    it("tracks and logs a 30-minute completed sprint", async () => {
      const event = await calendar.trackTime({
        title: "Reflexion Heuristic Induction",
        durationMinutes: 30,
        category: "focus",
        takeaway: "Inductive generalization reduces repetitive error loops by 40%",
        tags: ["reflexion", "heuristics"],
      });

      expect(event.id).toStartWith("trk_");
      expect(event.title).toBe("[Completed] Reflexion Heuristic Induction");
      expect(event.metadata?.focusHours).toBe(0.5);
      expect(event.description).toContain("Inductive generalization");

      const start = new Date(event.startTime).getTime();
      const end = new Date(event.endTime).getTime();
      expect(end - start).toBe(30 * 60 * 1000);
    });

    it("filters calendar events by category and limits output", async () => {
      await calendar.blockTime({ title: "Focus 1", durationMinutes: 25, category: "focus" });
      await calendar.blockTime({ title: "Study 1", durationMinutes: 60, category: "study" });
      await calendar.blockTime({ title: "Trade Review", durationMinutes: 15, category: "trade" });

      const focusOnly = calendar.listEvents({ category: "focus" });
      expect(focusOnly.length).toBe(1);
      expect(focusOnly[0].title).toBe("Focus 1");

      const limitTwo = calendar.listEvents({ limit: 2 });
      expect(limitTwo.length).toBe(2);
    });

    it("updates sync status when synced with external surface", () => {
      const eventId = "cal_test_123";
      (calendar as any).events = [
        {
          id: eventId,
          title: "Mock Event",
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          category: "focus",
          source: "local_store",
          syncStatus: "pending",
          createdAt: new Date().toISOString(),
        },
      ];

      const ok = calendar.updateSyncStatus(eventId, "notion_logged", "notion_page_abc");
      expect(ok).toBe(true);

      const updated = calendar.listEvents().find((e) => e.id === eventId);
      expect(updated?.syncStatus).toBe("notion_logged");
      expect(updated?.notionPageId).toBe("notion_page_abc");
    });
  });

  describe("3. Notion Sync Bridge Integration", () => {
    it("handles batch sync for pending events gracefully", async () => {
      await calendar.blockTime({
        title: "Focus: Socratic Voice Deliberation",
        durationMinutes: 30,
        category: "sparring",
      });

      // If Notion is configured or unconfigured, syncPendingEvents must return a structured result without crashing
      const result = await syncBridge.syncPendingEvents();
      expect(result).toHaveProperty("syncedCount");
      expect(result).toHaveProperty("failedCount");
      expect(result.events.length).toBe(1);
      expect(result.events[0].title).toBe("Focus: Socratic Voice Deliberation");
    });
  });

  describe("4. API Serverless Route /api/calendar", () => {
    function createMockRes() {
      const res: any = {
        statusCode: 200,
        headers: {},
        body: "",
        writeHead(code: number, headers: any) {
          res.statusCode = code;
          res.headers = headers;
        },
        end(data: string) {
          res.body = data;
        },
      };
      return res;
    }

    it("handles GET /api/calendar and returns events list", async () => {
      const req: any = {
        method: "GET",
        url: "/api/calendar?limit=5",
      };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.events)).toBe(true);
    });

    it("validates missing fields on POST /api/calendar", async () => {
      const req: any = {
        method: "POST",
        url: "/api/calendar",
        on(event: string, cb: any) {
          if (event === "data") cb(Buffer.from(JSON.stringify({ action: "block" })));
          if (event === "end") cb();
        },
      };
      const res = createMockRes();

      await handler(req, res);
      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error).toContain("Missing required fields");
    });
  });
});

