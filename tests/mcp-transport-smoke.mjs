import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inithyperwiki } from "../src/init.js";

class FramedJsonClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.buffer = Buffer.alloc(0);
    this.contentLength = null;
    this.pending = new Map();
    this.stderr = "";
    child.stdout.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      this.drain();
    });
    child.stderr.on("data", (chunk) => {
      this.stderr += String(chunk);
    });
    child.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`MCP server exited with ${code}: ${this.stderr}`));
      }
      this.pending.clear();
    });
  }

  request(method, params) {
    const id = this.nextId++;
    this.write({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}: ${this.stderr}`));
      }, 5000);
    });
  }

  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  write(message) {
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  drain() {
    while (true) {
      const message = this.nextMessage();
      if (!message) return;
      const pending = this.pending.get(message.id);
      if (!pending) continue;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  nextMessage() {
    if (this.contentLength === null) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return null;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) throw new Error(`Missing Content-Length in response: ${header}`);
      this.contentLength = Number(match[1]);
      this.buffer = this.buffer.slice(headerEnd + 4);
    }
    if (this.buffer.length < this.contentLength) return null;
    const body = this.buffer.slice(0, this.contentLength).toString("utf8");
    this.buffer = this.buffer.slice(this.contentLength);
    this.contentLength = null;
    return JSON.parse(body);
  }
}

const root = await mkdtemp(path.join(os.tmpdir(), "hyperwiki-mcp-transport-smoke-"));
await writeFile(path.join(root, "package.json"), `${JSON.stringify({
  name: "mcp-transport-smoke",
  packageManager: "pnpm@10.33.3",
  scripts: {
    check: "node --check index.js",
    "smoke:browser": "node browser-smoke.mjs"
  }
}, null, 2)}\n`);

await inithyperwiki(root, {
  yes: true,
  project_name: "MCP Transport Smoke",
  summary: "Project for MCP transport smoke coverage.",
  agent_launch_command: "codex --yolo"
});

const child = spawn(process.execPath, [path.resolve("src/cli.js"), "mcp"], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"]
});
const client = new FramedJsonClient(child);

try {
  const initialized = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "hyperwiki-smoke",
      version: "1.0.0"
    }
  });
  if (initialized.serverInfo?.name !== "hyperwiki" || !initialized.capabilities?.resources || !initialized.capabilities?.tools) {
    throw new Error(`Expected hyperwiki MCP initialize response, got ${JSON.stringify(initialized)}`);
  }
  client.notify("notifications/initialized", {});

  const resources = await client.request("resources/list", {});
  const uris = new Set(resources.resources.map((resource) => resource.uri));
  for (const uri of ["hyperwiki://project-contract", "hyperwiki://current-plan", "hyperwiki://verification-loops", "hyperwiki://review-workflows"]) {
    if (!uris.has(uri)) {
      throw new Error(`Expected MCP resource ${uri}, got ${JSON.stringify(resources.resources)}`);
    }
  }

  const currentPlan = await client.request("resources/read", { uri: "hyperwiki://current-plan" });
  const currentPlanPayload = JSON.parse(currentPlan.contents[0].text);
  if (!currentPlanPayload.status?.current || currentPlan.contents[0].mimeType !== "application/json") {
    throw new Error(`Expected current plan JSON resource, got ${JSON.stringify(currentPlan)}`);
  }

  const tools = await client.request("tools/list", {});
  const toolNames = new Set(tools.tools.map((tool) => tool.name));
  for (const name of ["get_project_contract", "get_current_plan", "list_verification_loops", "list_review_workflows"]) {
    if (!toolNames.has(name)) {
      throw new Error(`Expected MCP tool ${name}, got ${JSON.stringify(tools.tools)}`);
    }
  }
  if (toolNames.has("submit_agent_prompt") || toolNames.has("prepare_review_workflow")) {
    throw new Error(`Expected MCP transport to expose only read-only tools, got ${JSON.stringify(tools.tools)}`);
  }

  const contractResult = await client.request("tools/call", {
    name: "get_project_contract",
    arguments: {}
  });
  const contract = JSON.parse(contractResult.content[0].text);
  if (contract.project.name !== "MCP Transport Smoke" || contract.kind !== "hyperwiki.project-contract") {
    throw new Error(`Expected project contract tool payload, got ${JSON.stringify(contractResult)}`);
  }
} finally {
  child.kill();
}

console.log("mcp transport smoke test passed");
