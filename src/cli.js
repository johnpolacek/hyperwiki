#!/usr/bin/env node
import { initHyperWiki } from "./init.js";
import { launchHyperWiki } from "./launch.js";
import { resetHyperWiki } from "./reset.js";
import { startDevServer } from "./server.js";

const rawCommand = process.argv[2];
const command = !rawCommand || rawCommand.startsWith("--") ? "launch" : rawCommand;
const args = process.argv.slice(command === rawCommand ? 3 : 2);

try {
  if (command === "init") {
    await initHyperWiki(process.cwd(), parseArgs(args));
  } else if (command === "launch") {
    await launchHyperWiki(process.cwd(), launchOptions(parseArgs(args)));
  } else if (command === "reset") {
    await resetHyperWiki(process.cwd(), parseArgs(args));
  } else if (command === "dev") {
    await startDevServer(process.cwd(), parseArgs(args));
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args) {
  const parsed = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      parsed._.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.replaceAll("-", "_");
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (args[index + 1] && !args[index + 1].startsWith("--")) {
      parsed[key] = args[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function launchOptions(options) {
  return {
    ...options,
    open: options.open === false || options.open === "false" || options.no_open ? false : true
  };
}

function printHelp() {
  console.log(`HyperWiki

Usage:
  npx hyperwiki
  npx hyperwiki init [--yes] [--project-name NAME] [--summary TEXT] [--overwrite]
  npx hyperwiki reset [--dry-run]
  npx hyperwiki dev [--host 127.0.0.1] [--port 4177]
  npx hyperwiki launch [--host 127.0.0.1] [--port 4177] [--no-open]

Commands:
  init     Scaffold an HTML-first repo-local wiki and HyperWiki config.
  reset    Clear user registry and ignored local runtime state without touching wiki or config files.
  dev      Start the local-only HyperWiki workspace with wiki and terminal panels.
  launch   Start or attach to HyperWiki, open the browser workspace, and restore wterm panels.
`);
}
