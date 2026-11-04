import type { IncomingMessage, ServerResponse } from "http";
import {
  spinProject,
  listProjects,
  getProjectStatus,
  type SpinMode,
  type SpinProjectOptions,
} from "../src/services/antigravity.js";

function parseJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: any): void {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(jsonStr),
  });
  res.end(jsonStr);
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const urlObj = new URL(req.url || "/", "http://localhost");
  const queryAction = urlObj.searchParams.get("action");
  const queryProject = urlObj.searchParams.get("projectName") || urlObj.searchParams.get("name");

  try {
    // Handle GET Requests
    if (req.method === "GET") {
      if (queryAction === "status" || queryProject) {
        if (!queryProject) {
          sendJson(res, 400, { success: false, error: "Missing projectName parameter" });
          return;
        }
        const status = await getProjectStatus(queryProject);
        if (!status) {
          sendJson(res, 404, { success: false, error: `Project '${queryProject}' not found` });
          return;
        }
        sendJson(res, 200, { success: true, project: status });
        return;
      }

      // Default GET: list all projects
      const projects = await listProjects();
      sendJson(res, 200, { success: true, count: projects.length, projects });
      return;
    }

    // Handle POST Requests
    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      const action = body.action || queryAction || "spin";

      switch (action) {
        case "list": {
          const projects = await listProjects(body.stateDir);
          sendJson(res, 200, { success: true, count: projects.length, projects });
          return;
        }

        case "status": {
          const name = body.projectName || body.name || queryProject;
          if (!name) {
            sendJson(res, 400, { success: false, error: "Missing 'projectName' in payload" });
            return;
          }
          const status = await getProjectStatus(name, body.stateDir);
          if (!status) {
            sendJson(res, 404, { success: false, error: `Project '${name}' not found` });
            return;
          }
          sendJson(res, 200, { success: true, project: status });
          return;
        }

        case "spin": {
          const projectName = body.projectName || body.name;
          const initialPrompt = body.initialPrompt || body.prompt;

          if (!projectName) {
            sendJson(res, 400, { success: false, error: "Missing required 'projectName'" });
            return;
          }
          if (!initialPrompt) {
            sendJson(res, 400, { success: false, error: "Missing required 'initialPrompt'" });
            return;
          }

          const options: SpinProjectOptions = {
            projectName,
            initialPrompt,
            projectDir: body.projectDir,
            mode: (body.mode as SpinMode) || "auto",
            model: body.model,
            dangerouslySkipPermissions: body.dangerouslySkipPermissions,
            outputFormat: body.outputFormat,
            background: body.background !== undefined ? Boolean(body.background) : true,
            stateDir: body.stateDir,
          };

          const result = await spinProject(options);
          sendJson(res, 201, {
            success: true,
            message: `Project '${result.projectName}' spun successfully`,
            project: result,
          });
          return;
        }

        default:
          sendJson(res, 400, {
            success: false,
            error: `Unsupported action '${action}'. Supported: spin, list, status`,
          });
          return;
      }
    }

    sendJson(res, 405, { success: false, error: `Method ${req.method} not allowed` });
  } catch (err: any) {
    console.error("[AntigravityAPI] Handler error:", err);
    sendJson(res, 500, {
      success: false,
      error: err?.message || "Internal server error occurred while processing Antigravity request",
    });
  }
}
