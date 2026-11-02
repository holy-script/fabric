import { describe, test, expect } from "bun:test";
import handler from "../api/a2a.js";
import { EventEmitter } from "events";

function createMockReqRes(method: string, url: string, body?: any) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "localhost:3000", "content-type": "application/json" };

  let responseData = "";
  let statusCode = 200;

  const res = {
    statusCode: 200,
    setHeader: () => {},
    end: (data: string) => {
      responseData = data;
      statusCode = res.statusCode;
    },
  };

  const execute = async (): Promise<{ status: number; body: any }> => {
    const promise = handler(req, res as any);
    if (body) {
      req.emit("data", JSON.stringify(body));
    }
    req.emit("end");
    await promise;
    let parsed = null;
    try {
      parsed = JSON.parse(responseData);
    } catch {
      parsed = responseData;
    }
    return { status: statusCode, body: parsed };
  };

  return { req, res, execute };
}

describe("Universal A2A Protocol QC Suite", () => {
  test("GET /api/a2a returns self-describing OpenAPI-style tool schema", async () => {
    const { execute } = createMockReqRes("GET", "/api/a2a");
    const { status, body } = await execute();

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.service).toContain("A2A Universal Agent Protocol");
    expect(Array.isArray(body.availableTools)).toBe(true);
    expect(body.availableTools.length).toBeGreaterThanOrEqual(6);
  });

  test("POST /api/a2a with action 'search' returns structured knowledge items", async () => {
    const { execute } = createMockReqRes("POST", "/api/a2a", {
      action: "search",
      query: "fastapi",
      limit: 2,
    });
    const { status, body } = await execute();

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.data.query).toBe("fastapi");
    expect(Array.isArray(body.data.items)).toBe(true);
    if (body.data.items.length > 0) {
      const item = body.data.items[0];
      expect(item.label).toBeDefined();
      expect(item.actionableTakeaway).toBeDefined();
    }
  });

  test("POST /api/a2a with JSON-RPC 2.0 format works properly", async () => {
    const { execute } = createMockReqRes("POST", "/api/a2a", {
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: {
        name: "fabric_search_knowledge",
        arguments: { query: "stoicism", limit: 2 },
      },
    });
    const { status, body } = await execute();

    expect(status).toBe(200);
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(42);
    expect(Array.isArray(body.result?.content)).toBe(true);
  });
});
