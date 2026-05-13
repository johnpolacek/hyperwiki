import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const managedStart = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
const managedEnd = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";

export const defaultSettings = Object.freeze({
  theme: {
    activePreset: "paper",
    presets: {
      paper: {
        label: "Paper",
        mode: "light",
        tokens: {
          ui: {
            bg: "#f7f7f4",
            panel: "#ffffff",
            border: "#d8d8d0",
            text: "#20231f",
            muted: "#62675f",
            accent: "#276ef1",
            sidebarFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          docs: {
            bg: "#fbfaf4",
            panel: "#fffdf8",
            border: "#ddd7c9",
            text: "#24221d",
            muted: "#6f695d",
            link: "#285f8f",
            code: "#efede4",
            serifFont: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
            monoFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          terminal: {
            bg: "#272822",
            pane: "#111312",
            toolbar: "#171a18",
            header: "#1b1f1b",
            border: "#2c302d",
            text: "#eef2ec",
            muted: "#abb5ad",
            accent: "#9fd1ff",
            font: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }
        }
      },
      ink: {
        label: "Ink",
        mode: "dark",
        tokens: {
          ui: {
            bg: "#161714",
            panel: "#20211d",
            border: "#383a33",
            text: "#eeeee8",
            muted: "#a4a89d",
            accent: "#8bcf7a",
            sidebarFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          docs: {
            bg: "#171813",
            panel: "#202018",
            border: "#3b392d",
            text: "#efeadc",
            muted: "#b4aa93",
            link: "#9bc6ff",
            code: "#2a291f",
            serifFont: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
            monoFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          terminal: {
            bg: "#10120f",
            pane: "#0b0d0b",
            toolbar: "#151813",
            header: "#191d17",
            border: "#33392f",
            text: "#f0f5ed",
            muted: "#a7b0a3",
            accent: "#8bcf7a",
            font: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }
        }
      },
      blueprint: {
        label: "Blueprint",
        mode: "light",
        tokens: {
          ui: {
            bg: "#f3f7f8",
            panel: "#ffffff",
            border: "#cbd9dc",
            text: "#172326",
            muted: "#5f6f73",
            accent: "#0c6c83",
            sidebarFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          docs: {
            bg: "#f8faf7",
            panel: "#ffffff",
            border: "#d4ddd9",
            text: "#202923",
            muted: "#65736b",
            link: "#0c6c83",
            code: "#e9f0ef",
            serifFont: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
            monoFont: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          terminal: {
            bg: "#1e2528",
            pane: "#13181a",
            toolbar: "#182023",
            header: "#202a2d",
            border: "#344145",
            text: "#ecf4f5",
            muted: "#a8b8bc",
            accent: "#68d2ec",
            font: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }
        }
      },
      ledger: {
        label: "Ledger",
        mode: "light",
        tokens: {
          ui: {
            bg: "#f5f6ef",
            panel: "#fffffb",
            border: "#d4d8c8",
            text: "#20261d",
            muted: "#626b5b",
            accent: "#4f7d36",
            sidebarFont: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          docs: {
            bg: "#fbfaf0",
            panel: "#fffdf4",
            border: "#ded9c5",
            text: "#252318",
            muted: "#706a56",
            link: "#775f16",
            code: "#eeead8",
            serifFont: "\"Source Serif 4\", ui-serif, Georgia, serif",
            monoFont: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          terminal: {
            bg: "#20251d",
            pane: "#11150f",
            toolbar: "#171d14",
            header: "#1d2419",
            border: "#3d4736",
            text: "#f0f4e8",
            muted: "#b1b9a8",
            accent: "#b8d986",
            font: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }
        }
      },
      dusk: {
        label: "Dusk",
        mode: "dark",
        tokens: {
          ui: {
            bg: "#18151b",
            panel: "#221e27",
            border: "#403746",
            text: "#f1edf3",
            muted: "#afa3b8",
            accent: "#e28f62",
            sidebarFont: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          docs: {
            bg: "#1a161d",
            panel: "#241f28",
            border: "#44394a",
            text: "#f2eadf",
            muted: "#b9aa9d",
            link: "#f1ad7a",
            code: "#332a32",
            serifFont: "\"Newsreader\", ui-serif, Georgia, serif",
            monoFont: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          },
          terminal: {
            bg: "#130f15",
            pane: "#0d0a0f",
            toolbar: "#1a141d",
            header: "#211926",
            border: "#433549",
            text: "#f5edf5",
            muted: "#b8a8bd",
            accent: "#e28f62",
            font: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
          }
        }
      }
    },
    customTokens: {}
  },
  soul: {
    principles: [
      "HyperWiki is local-first, durable, and agent-readable.",
      "Prefer concise, concrete language over marketing language.",
      "Keep product behavior visible, inspectable, and reversible."
    ],
    interface: "Use quiet, utilitarian UI that supports repeated planning, reading, and agent handoff work.",
    agent: "Agents should preserve repo-local truth, name uncertainty, update durable wiki context, and run relevant checks before finishing."
  },
  memory: {
    entries: []
  }
});

export function hyperwikiHome() {
  return path.resolve(process.env.HYPERWIKI_HOME || path.join(os.homedir(), ".hyperwiki"));
}

export async function readSettings() {
  const settingsPath = path.join(hyperwikiHome(), "settings.json");
  if (!existsSync(settingsPath)) {
    return structuredClone(defaultSettings);
  }
  const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
  return mergeSettings(defaultSettings, parsed);
}

export async function writeSettings(settings) {
  const next = mergeSettings(defaultSettings, settings);
  const settingsPath = path.join(hyperwikiHome(), "settings.json");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function resetThemeSettings() {
  const settings = await readSettings();
  settings.theme = structuredClone(defaultSettings.theme);
  return writeSettings(settings);
}

export function themeCss(settings) {
  const theme = effectiveTheme(settings);
  const ui = theme.tokens.ui;
  const docs = theme.tokens.docs;
  const terminal = theme.tokens.terminal;
  return `:root {
  color-scheme: ${theme.mode === "dark" ? "dark" : "light"};
  --bg: ${ui.bg};
  --panel: ${ui.panel};
  --border: ${ui.border};
  --text: ${ui.text};
  --muted: ${ui.muted};
  --accent: ${ui.accent};
  --sidebar-font: ${ui.sidebarFont};
  --docs-bg: ${docs.bg};
  --docs-panel: ${docs.panel};
  --docs-border: ${docs.border};
  --docs-text: ${docs.text};
  --docs-muted: ${docs.muted};
  --docs-link: ${docs.link};
  --docs-code: ${docs.code};
  --docs-serif-font: ${docs.serifFont};
  --docs-mono-font: ${docs.monoFont};
  --terminal-bg: ${terminal.bg};
  --terminal-pane: ${terminal.pane};
  --terminal-toolbar: ${terminal.toolbar};
  --terminal-header: ${terminal.header};
  --terminal-border: ${terminal.border};
  --terminal-text: ${terminal.text};
  --terminal-muted: ${terminal.muted};
  --terminal-accent: ${terminal.accent};
  --terminal-font: ${terminal.font || docs.monoFont};
}
`;
}

export function effectiveTheme(settings) {
  const activePreset = settings.theme?.activePreset || defaultSettings.theme.activePreset;
  const preset = settings.theme?.presets?.[activePreset] || defaultSettings.theme.presets.paper;
  return mergeSettings(preset, {
    tokens: settings.theme?.customTokens || {}
  });
}

export async function syncAgentsFile(root, baseContent = null) {
  const settings = await readSettings();
  const filePath = path.join(root, "AGENTS.md");
  const existing = typeof baseContent === "string"
    ? baseContent
    : existsSync(filePath) ? await readFile(filePath, "utf8") : "";
  const block = renderAgentsBlock(settings);
  const next = existing.includes(managedStart) && existing.includes(managedEnd)
    ? existing.replace(new RegExp(`${escapeRegExp(managedStart)}[\\s\\S]*?${escapeRegExp(managedEnd)}`), block)
    : `${existing.trimEnd()}${existing.trim() ? "\n\n" : ""}${block}\n`;
  await writeFile(filePath, next, "utf8");
  return { path: filePath, memoryEntries: enabledMemoryEntries(settings).length };
}

function renderAgentsBlock(settings) {
  const soul = settings.soul || {};
  const principles = Array.isArray(soul.principles) ? soul.principles.filter(Boolean) : [];
  const memories = enabledMemoryEntries(settings);
  return `${managedStart}
## HyperWiki Global Context

### Soul

${principles.length ? principles.map((item) => `- ${item}`).join("\n") : "- No global soul principles recorded."}

Interface guidance: ${soul.interface || "Use HyperWiki's default interface guidance."}

Agent guidance: ${soul.agent || "Use HyperWiki's default agent guidance."}

### Memory

${memories.length ? memories.map((entry) => `- ${entry.title ? `${entry.title}: ` : ""}${entry.content}`).join("\n") : "- No approved global memory entries recorded."}
${managedEnd}`;
}

function enabledMemoryEntries(settings) {
  return (Array.isArray(settings.memory?.entries) ? settings.memory.entries : [])
    .filter((entry) => entry && entry.enabled !== false && String(entry.content || "").trim())
    .map((entry) => ({
      title: String(entry.title || "").trim(),
      content: String(entry.content || "").trim()
    }));
}

function mergeSettings(base, override) {
  if (!isPlainObject(base)) return structuredClone(override ?? base);
  const next = structuredClone(base);
  if (!isPlainObject(override)) return next;
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(next[key])) {
      next[key] = mergeSettings(next[key], value);
    } else {
      next[key] = structuredClone(value);
    }
  }
  return next;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
