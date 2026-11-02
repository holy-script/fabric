import { describe, it, expect } from "bun:test";
import fs from "fs";
import path from "path";
import docsHandler from "../api/docs.js";

describe("Fabric OS Architecture & Explainability Dossier QC Suite", () => {
  const dossierPath = path.resolve(process.cwd(), "docs/EXPLAINABILITY_AND_EVOLUTION.md");

  it("ensures docs/EXPLAINABILITY_AND_EVOLUTION.md exists and is structurally complete", () => {
    expect(fs.existsSync(dossierPath)).toBe(true);
    const content = fs.readFileSync(dossierPath, "utf-8");

    expect(content).toContain("Executive Abstract");
    expect(content).toContain("Genesis & Evolution Timeline");
    expect(content).toContain("Era 1");
    expect(content).toContain("Era 2");
    expect(content).toContain("Era 3");
    expect(content).toContain("Era 4");
    expect(content).toContain("Era 5");
    expect(content).toContain("Era 6");
    expect(content).toContain("Era 7");
    expect(content).toContain("The 4F Unified Equation & Cybernetic Loops");
    expect(content).toContain("Aristotelian Virtue Vector");
    expect(content).toContain("System Architecture");
    expect(content).toContain("Service & Device Integration Matrix");
    expect(content).toContain("Future Horizon & North Star");
  });

  it("renders docs endpoint successfully as rich HTML with KaTeX and Mermaid", async () => {
    let statusCode = 0;
    const headers: Record<string, string> = {};
    let responseBody = "";

    const req: any = {
      url: "/docs",
      method: "GET",
    };

    const res: any = {
      statusCode: 200,
      setHeader: (key: string, val: string) => {
        headers[key] = val;
      },
      end: (chunk: string) => {
        responseBody = chunk;
      },
    };

    await docsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(headers["Content-Type"]).toContain("text/html");
    expect(responseBody).toContain("katex.min.js");
    expect(responseBody).toContain("mermaid.min.js");
    expect(responseBody).toContain("marked.min.js");
    expect(responseBody).toContain("The Seven Epochs of Fabric OS");
  });

  it("serves raw markdown when ?raw=true is specified", async () => {
    let responseBody = "";
    const headers: Record<string, string> = {};

    const req: any = {
      url: "/docs?raw=true",
      method: "GET",
    };

    const res: any = {
      statusCode: 200,
      setHeader: (key: string, val: string) => {
        headers[key] = val;
      },
      end: (chunk: string) => {
        responseBody = chunk;
      },
    };

    await docsHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(headers["Content-Type"]).toContain("text/markdown");
    expect(responseBody).toContain("# The Fabric OS: Master Architecture & Explainability Dossier");
  });
});
