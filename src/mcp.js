import path from "node:path";
import {
  guardrailSummary,
  listWikiPages,
  mcpSurfaceSummary,
  projectContract,
  readConfig,
  reviewWorkflowSummary,
  sourceBriefSummary,
  verificationSummary
} from "./server.js";

const protocolVersion = "2024-11-05";
const serverInfo = {
  name: "hyperwiki",
  version: "0.1.1"
};

export async function startMcpServer(root = process.cwd(), options = {}) {
  const server = new HyperwikiMcpServer(path.resolve(root), {
    input: options.input || process.stdin,
    output: options.output || process.stdout
  });
  await server.start();
  return server;
}

class HyperwikiMcpServer {
  constructor(root, { input, output }) {
    this.root = root;
    this.input = input;
    this.output = output;
    this.buffer = Buffer.alloc(0);
    this.contentLength = null;
    this.started = false;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.input.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
      void this.drainMessages();
    });
    this.input.on("end", () => {
      this.started = false;
    });
  }

  async drainMessages() {
    while (true) {
      const message = this.nextMessage();
      if (!message) return;
      await this.handleMessage(message);
    }
  }

  nextMessage() {
    if (this.contentLength === null) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return null;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        throw new Error("MCP message missing Content-Length header.");
      }
      this.contentLength = Number(match[1]);
      this.buffer = this.buffer.slice(headerEnd + 4);
    }
    if (this.buffer.length < this.contentLength) return null;
    const body = this.buffer.slice(0, this.contentLength).toString("utf8");
    this.buffer = this.buffer.slice(this.contentLength);
    this.contentLength = null;
    return JSON.parse(body);
  }

  async handleMessage(message) {
    if (!Object.hasOwn(message, "id")) {
      return;
    }
    try {
      const result = await this.dispatch(message.method, message.params || {});
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        result
      });
    } catch (error) {
      this.write({
        jsonrpc: "2.0",
        id: message.id,
        error: {
          code: error.code || -32603,
          message: error.message || "MCP request failed."
        }
      });
    }
  }

  async dispatch(method, params) {
    if (method === "initialize") return this.initialize();
    if (method === "resources/list") return this.resourcesList();
    if (method === "resources/read") return this.resourcesRead(params.uri);
    if (method === "tools/list") return this.toolsList();
    if (method === "tools/call") return this.toolsCall(params.name, params.arguments || {});
    throw mcpError(-32601, `Unsupported MCP method: ${method}`);
  }

  initialize() {
    return {
      protocolVersion,
      capabilities: {
        resources: {},
        tools: {}
      },
      serverInfo
    };
  }

  async resourcesList() {
    const surface = await this.surface();
    return {
      resources: surface.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType
      }))
    };
  }

  async resourcesRead(uri) {
    const payload = await this.resourcePayload(uri);
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: `${JSON.stringify(payload, null, 2)}\n`
        }
      ]
    };
  }

  async toolsList() {
    const surface = await this.surface();
    return {
      tools: surface.tools
        .filter((tool) => tool.readOnly)
        .map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
    };
  }

  async toolsCall(name, args) {
    const calls = {
      get_project_contract: () => this.projectContract(),
      get_current_plan: async () => (await this.projectContract()).plan,
      list_verification_loops: () => this.verificationSummary(),
      list_review_workflows: () => this.reviewWorkflows()
    };
    const call = calls[name];
    if (!call) {
      throw mcpError(-32602, `Unsupported or non-read-only MCP tool: ${name}`);
    }
    if (Object.keys(args).length > 0) {
      throw mcpError(-32602, `${name} does not accept arguments.`);
    }
    const payload = await call();
    return {
      content: [
        {
          type: "text",
          text: `${JSON.stringify(payload, null, 2)}\n`
        }
      ],
      isError: false
    };
  }

  async resourcePayload(uri) {
    const payloads = {
      "hyperwiki://project-contract": () => this.projectContract(),
      "hyperwiki://current-plan": async () => (await this.projectContract()).plan,
      "hyperwiki://source-index": async () => (await this.projectContract()).sources,
      "hyperwiki://verification-loops": () => this.verificationSummary(),
      "hyperwiki://guardrails": () => guardrailSummary(this.root),
      "hyperwiki://review-workflows": () => this.reviewWorkflows(),
      "hyperwiki://wiki-pages": () => listWikiPages(this.root)
    };
    const load = payloads[uri];
    if (!load) {
      throw mcpError(-32602, `Unknown MCP resource: ${uri}`);
    }
    return load();
  }

  async surface() {
    return mcpSurfaceSummary(this.root, await this.config());
  }

  async projectContract() {
    return projectContract(this.root, await this.config());
  }

  async verificationSummary() {
    return verificationSummary(this.root, await this.config());
  }

  async reviewWorkflows() {
    return reviewWorkflowSummary(this.root, await this.config());
  }

  async config() {
    return readConfig(this.root);
  }

  write(message) {
    const body = JSON.stringify(message);
    this.output.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }
}

function mcpError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
