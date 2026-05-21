import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const child = spawn("cargo", ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--", "mcp"], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "pipe"]
});

let stdout = Buffer.alloc(0);
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout = Buffer.concat([stdout, chunk]);
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

let nextId = 1;

function frame(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function readFrame(id) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        const headerEnd = stdout.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          const header = stdout.subarray(0, headerEnd).toString("utf8");
          const lengthLine = header.split(/\r?\n/).find((line) => /^content-length:/i.test(line));
          assert.ok(lengthLine, "MCP response is missing Content-Length");
          const length = Number(lengthLine.split(":")[1].trim());
          const bodyStart = headerEnd + 4;
          if (stdout.length >= bodyStart + length) {
            const body = stdout.subarray(bodyStart, bodyStart + length).toString("utf8");
            stdout = stdout.subarray(bodyStart + length);
            clearInterval(timer);
            const response = JSON.parse(body);
            assert.equal(response.id, id);
            resolve(response);
          }
        }
        if (Date.now() - started > 15000) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for MCP response ${id}. stderr: ${stderr}`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 25);
  });
}

async function request(method, params = {}) {
  const id = nextId++;
  child.stdin.write(frame({ jsonrpc: "2.0", id, method, params }));
  return readFrame(id);
}

try {
  const initialized = await request("initialize");
  assert.equal(initialized.result.serverInfo.name, "hyperwiki");
  assert.ok(initialized.result.capabilities.resources);
  assert.ok(initialized.result.capabilities.tools);

  const listedResources = await request("resources/list");
  const resourceUris = listedResources.result.resources.map((resource) => resource.uri);
  assert.ok(resourceUris.includes("hyperwiki://project-contract"));
  assert.ok(resourceUris.includes("hyperwiki://verification-loops"));
  assert.ok(resourceUris.every((uri) => uri.startsWith("hyperwiki://")));

  const projectContract = await request("resources/read", { uri: "hyperwiki://project-contract" });
  const contractText = projectContract.result.contents[0].text;
  const contract = JSON.parse(contractText);
  assert.match(contractText, /"kind": "hyperwiki\.project-contract"/);
  assert.match(contractText, /"boundary": "localhost-tooling"/);
  assert.match(contractText, /"runtimeTruth"/);
  const urls = Array.from(contractText.matchAll(/https?:\/\/[^"\\\s]+/g), (match) => match[0]);
  assert.ok(
    urls.every((url) => {
      const normalized = url.replace("<branch-slug>", "branch").replace(/[).,;]+$/, "");
      const hostname = new URL(normalized).hostname;
      return hostname.endsWith(".localhost") || hostname === "127.0.0.1" || hostname === "localhost";
    }),
    `Expected MCP contract URLs to stay localhost-scoped, saw: ${urls.join(", ")}`
  );
  assert.equal(contract.project.root, process.cwd());
  assert.deepEqual(contract.canonicalTruth, ["wiki/", ".git"]);

  const tools = await request("tools/list");
  const toolNames = tools.result.tools.map((tool) => tool.name);
  assert.ok(toolNames.includes("get_project_contract"));
  assert.ok(toolNames.includes("list_review_workflows"));
  assert.ok(!toolNames.includes("prepare_review_workflow"));
  assert.ok(!toolNames.includes("submit_agent_prompt"));

  const blockedAction = await request("tools/call", {
    name: "submit_agent_prompt",
    arguments: {}
  });
  assert.equal(blockedAction.error.code, -32602);
  assert.match(blockedAction.error.message, /Unsupported or non-read-only MCP tool/);

  const blockedArgs = await request("tools/call", {
    name: "get_project_contract",
    arguments: { path: "/tmp/outside" }
  });
  assert.equal(blockedArgs.error.code, -32602);
  assert.match(blockedArgs.error.message, /does not accept arguments/);

  console.log("mcp transport smoke test passed");
} finally {
  child.stdin.end();
  child.kill();
}
