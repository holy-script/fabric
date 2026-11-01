import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export interface R2NodeConfig {
  id: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string; // e.g. "https://pub-xxxx.r2.dev"
  active?: boolean;
}

export interface R2NodeUsage {
  bytesUsed: number;
  objectCount: number;
  lastUpdated: string;
}

export interface R2PoolUsage {
  nodes: Record<string, R2NodeUsage>;
  lastUpdated: string;
}

export interface UploadResult {
  streamUrl: string;
  nodeId: string;
  key: string;
  sizeBytes: number;
}

const POOL_CONFIG_FILE = path.resolve(process.cwd(), "r2_pools.json");
const POOL_USAGE_FILE = path.resolve(process.cwd(), ".r2_pool_usage.json");

export class R2PoolManager {
  private nodes: R2NodeConfig[] = [];
  private clients: Map<string, S3Client> = new Map();
  private usage: R2PoolUsage = { nodes: {}, lastUpdated: new Date().toISOString() };
  private roundRobinIdx = 0;

  constructor(configFilePath?: string) {
    this.loadUsage();
    this.loadNodes(configFilePath);
  }

  private loadUsage(): void {
    if (fs.existsSync(POOL_USAGE_FILE)) {
      try {
        this.usage = JSON.parse(fs.readFileSync(POOL_USAGE_FILE, "utf-8"));
      } catch {
        this.usage = { nodes: {}, lastUpdated: new Date().toISOString() };
      }
    }
  }

  private saveUsage(): void {
    try {
      this.usage.lastUpdated = new Date().toISOString();
      fs.writeFileSync(POOL_USAGE_FILE, JSON.stringify(this.usage, null, 2), "utf-8");
    } catch (err) {
      console.warn("⚠️ Failed to persist R2 pool usage tracker:", err);
    }
  }

  public loadNodes(customPath?: string): void {
    const configPath = customPath || POOL_CONFIG_FILE;
    this.nodes = [];
    this.clients.clear();

    // 1. Try JSON configuration file
    if (fs.existsSync(configPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (Array.isArray(raw)) {
          this.nodes = raw.map((item, idx) => ({
            id: item.id || `node-${idx + 1}`,
            accountId: item.accountId || "",
            accessKeyId: item.accessKeyId || "",
            secretAccessKey: item.secretAccessKey || "",
            bucketName: item.bucketName || "",
            publicUrl: (item.publicUrl || "").replace(/\/+$/, ""),
            active: item.active !== false,
          }));
        }
      } catch (err) {
        console.warn(`⚠️ Failed reading R2 config from ${configPath}:`, err);
      }
    }

    // 2. Fallback to environment variables if no nodes loaded
    if (this.nodes.length === 0) {
      const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
      const accessKeyId = process.env.R2_ACCESS_KEY_ID;
      const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const bucketName = process.env.R2_BUCKET_NAME || "fabric-media";
      const publicUrl = process.env.R2_PUBLIC_URL;

      if (accountId && accessKeyId && secretAccessKey) {
        this.nodes.push({
          id: "primary-env",
          accountId,
          accessKeyId,
          secretAccessKey,
          bucketName,
          publicUrl: (publicUrl || `https://${bucketName}.${accountId}.r2.dev`).replace(/\/+$/, ""),
          active: true,
        });
      }
    }

    // Initialize S3 clients for active nodes
    for (const node of this.getActiveNodes()) {
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${node.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: node.accessKeyId,
          secretAccessKey: node.secretAccessKey,
        },
      });
      this.clients.set(node.id, client);
    }
  }

  public getActiveNodes(): R2NodeConfig[] {
    return this.nodes.filter(
      (n) => n.active !== false && n.accountId && n.accessKeyId && n.secretAccessKey && n.bucketName
    );
  }

  public hasActiveNodes(): boolean {
    return this.getActiveNodes().length > 0;
  }

  public getAllNodes(): R2NodeConfig[] {
    return [...this.nodes];
  }

  /**
   * Selects an active node based on least-storage usage or round-robin
   */
  public selectNode(): R2NodeConfig {
    const active = this.getActiveNodes();
    if (active.length === 0) {
      throw new Error(
        "No active R2 storage nodes configured. Please populate r2_pools.json or set R2_* environment variables."
      );
    }

    // Find node with least bytes used
    let chosen = active[0];
    let minBytes = Infinity;

    for (const node of active) {
      const bytes = this.usage.nodes[node.id]?.bytesUsed || 0;
      if (bytes < minBytes) {
        minBytes = bytes;
        chosen = node;
      }
    }

    return chosen;
  }

  /**
   * Uploads a local file to the selected R2 node.
   */
  public async uploadFile(
    localFilePath: string,
    key: string,
    contentType?: string
  ): Promise<UploadResult> {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File not found: ${localFilePath}`);
    }

    const node = this.selectNode();
    const client = this.clients.get(node.id);
    if (!client) {
      throw new Error(`S3Client for node ${node.id} not initialized.`);
    }

    const fileBuffer = fs.readFileSync(localFilePath);
    const sizeBytes = fileBuffer.length;

    // Detect content type if not provided
    let mimeType = contentType;
    if (!mimeType) {
      const ext = path.extname(localFilePath).toLowerCase();
      if (ext === ".mp4") mimeType = "video/mp4";
      else if (ext === ".m4a") mimeType = "audio/mp4";
      else if (ext === ".mp3") mimeType = "audio/mpeg";
      else if (ext === ".webm") mimeType = "video/webm";
      else mimeType = "application/octet-stream";
    }

    const cleanKey = key.replace(/^\/+/, "");

    const command = new PutObjectCommand({
      Bucket: node.bucketName,
      Key: cleanKey,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await client.send(command);

    // Track usage
    if (!this.usage.nodes[node.id]) {
      this.usage.nodes[node.id] = { bytesUsed: 0, objectCount: 0, lastUpdated: new Date().toISOString() };
    }
    this.usage.nodes[node.id].bytesUsed += sizeBytes;
    this.usage.nodes[node.id].objectCount += 1;
    this.usage.nodes[node.id].lastUpdated = new Date().toISOString();
    this.saveUsage();

    const streamUrl = `${node.publicUrl}/${cleanKey}`;
    return {
      streamUrl,
      nodeId: node.id,
      key: cleanKey,
      sizeBytes,
    };
  }

  /**
   * Deletes an object from a specified node.
   */
  public async deleteFile(nodeId: string, key: string): Promise<boolean> {
    const client = this.clients.get(nodeId);
    const node = this.nodes.find((n) => n.id === nodeId);
    if (!client || !node) return false;

    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: node.bucketName,
          Key: key,
        })
      );
      return true;
    } catch (err) {
      console.warn(`Failed to delete ${key} on node ${nodeId}:`, err);
      return false;
    }
  }

  /**
   * Returns statistics across all nodes
   */
  public getStats(): {
    totalNodes: number;
    activeNodes: number;
    totalBytes: number;
    totalObjects: number;
    nodes: Array<{
      id: string;
      bucket: string;
      active: boolean;
      publicUrl: string;
      bytesUsed: number;
      mbUsed: string;
      objectCount: number;
    }>;
  } {
    const nodes = this.nodes.map((n) => {
      const u = this.usage.nodes[n.id] || { bytesUsed: 0, objectCount: 0 };
      return {
        id: n.id,
        bucket: n.bucketName,
        active: n.active !== false,
        publicUrl: n.publicUrl,
        bytesUsed: u.bytesUsed,
        mbUsed: (u.bytesUsed / (1024 * 1024)).toFixed(2) + " MB",
        objectCount: u.objectCount,
      };
    });

    const totalBytes = nodes.reduce((sum, n) => sum + n.bytesUsed, 0);
    const totalObjects = nodes.reduce((sum, n) => sum + n.objectCount, 0);

    return {
      totalNodes: this.nodes.length,
      activeNodes: this.getActiveNodes().length,
      totalBytes,
      totalObjects,
      nodes,
    };
  }
}

// Default export and singleton instance
export const r2Pool = new R2PoolManager();
