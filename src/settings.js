import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const managedStart = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
const managedEnd = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";

const themeFonts = {
  inter: "\"Inter\", ui-sans-serif, system-ui, sans-serif",
  ibmSans: "\"IBM Plex Sans\", ui-sans-serif, system-ui, sans-serif",
  workSans: "\"Work Sans\", ui-sans-serif, system-ui, sans-serif",
  sourceSans: "\"Source Sans 3\", ui-sans-serif, system-ui, sans-serif",
  montserrat: "\"Montserrat\", ui-sans-serif, system-ui, sans-serif",
  dmSans: "\"DM Sans\", ui-sans-serif, system-ui, sans-serif",
  notoSans: "\"Noto Sans\", ui-sans-serif, system-ui, sans-serif",
  poppins: "\"Poppins\", ui-sans-serif, system-ui, sans-serif",
  nunito: "\"Nunito\", ui-sans-serif, system-ui, sans-serif",
  instrument: "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif",
  sourceSerif: "\"Source Serif 4\", ui-serif, Georgia, serif",
  lora: "\"Lora\", ui-serif, Georgia, serif",
  newsreader: "\"Newsreader\", ui-serif, Georgia, serif",
  merriweather: "\"Merriweather\", ui-serif, Georgia, serif",
  ebGaramond: "\"EB Garamond\", ui-serif, Georgia, serif",
  cormorant: "\"Cormorant Garamond\", ui-serif, Georgia, serif",
  literata: "\"Literata\", ui-serif, Georgia, serif",
  fraunces: "\"Fraunces\", ui-serif, Georgia, serif",
  sometype: "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  ibmMono: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  spaceMono: "\"Space Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  jetBrainsMono: "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  firaCode: "\"Fira Code\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  sourceCodePro: "\"Source Code Pro\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  robotoMono: "\"Roboto Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
};

function themePreset({
  label,
  mode,
  bodyFont,
  monoFont,
  ui,
  docs,
  terminal
}) {
  return {
    label,
    mode,
    tokens: {
      ui: {
        ...ui,
        accent: ui.accent,
        sidebarFont: monoFont
      },
      docs: {
        ...docs,
        link: docs.link,
        code: docs.code,
        serifFont: bodyFont,
        monoFont
      },
      terminal: {
        ...terminal,
        accent: terminal.accent,
        font: monoFont
      }
    }
  };
}

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
      atlas: themePreset({
        label: "Atlas", mode: "light", bodyFont: themeFonts.inter, monoFont: themeFonts.sometype,
        ui: { bg: "#f4f7f8", panel: "#ffffff", border: "#cad8dc", text: "#17252a", muted: "#5d6d72", accent: "#0b7285" },
        docs: { bg: "#fafcfb", panel: "#ffffff", border: "#d3dddc", text: "#1f2928", muted: "#637170", link: "#0b7285", code: "#e9f1f1" },
        terminal: { bg: "#1a2428", pane: "#10181b", toolbar: "#142025", header: "#1b2a30", border: "#34464c", text: "#eef7f8", muted: "#a9b8bb", accent: "#6bd6e6" }
      }),
      grove: themePreset({
        label: "Grove", mode: "light", bodyFont: themeFonts.sourceSerif, monoFont: themeFonts.ibmMono,
        ui: { bg: "#f5f6ef", panel: "#fffffb", border: "#d4d8c8", text: "#20261d", muted: "#626b5b", accent: "#4f7d36" },
        docs: { bg: "#fbfaf0", panel: "#fffdf4", border: "#ded9c5", text: "#252318", muted: "#706a56", link: "#5f7426", code: "#eeead8" },
        terminal: { bg: "#20251d", pane: "#11150f", toolbar: "#171d14", header: "#1d2419", border: "#3d4736", text: "#f0f4e8", muted: "#b1b9a8", accent: "#b8d986" }
      }),
      studio: themePreset({
        label: "Studio", mode: "light", bodyFont: themeFonts.ibmSans, monoFont: themeFonts.ibmMono,
        ui: { bg: "#f7f5f1", panel: "#ffffff", border: "#d8d2c7", text: "#24211c", muted: "#6c655b", accent: "#a14f2a" },
        docs: { bg: "#fcfaf6", panel: "#fffdf9", border: "#ddd4c6", text: "#28221c", muted: "#75695d", link: "#a14f2a", code: "#efe7dc" },
        terminal: { bg: "#29211c", pane: "#15100d", toolbar: "#1d1713", header: "#241c17", border: "#4b3a31", text: "#f6eee6", muted: "#b9aaa0", accent: "#f0a06f" }
      }),
      linen: themePreset({
        label: "Linen", mode: "light", bodyFont: themeFonts.lora, monoFont: themeFonts.sometype,
        ui: { bg: "#f8f3ea", panel: "#fffdf7", border: "#dfd4c2", text: "#272118", muted: "#716758", accent: "#8b6f21" },
        docs: { bg: "#fffaf1", panel: "#fffdf7", border: "#e2d7c4", text: "#282116", muted: "#716551", link: "#8b6f21", code: "#f1e8d9" },
        terminal: { bg: "#282318", pane: "#15120d", toolbar: "#1d1911", header: "#242016", border: "#4b432e", text: "#f6f1e6", muted: "#bbb29e", accent: "#d9bf64" }
      }),
      signal: themePreset({
        label: "Signal", mode: "light", bodyFont: themeFonts.workSans, monoFont: themeFonts.spaceMono,
        ui: { bg: "#f5f5f7", panel: "#ffffff", border: "#d2d4dc", text: "#20222a", muted: "#646978", accent: "#3f5bf6" },
        docs: { bg: "#fbfbff", panel: "#ffffff", border: "#d8d9e6", text: "#202133", muted: "#666a7e", link: "#3f5bf6", code: "#eceef8" },
        terminal: { bg: "#181b29", pane: "#0e1019", toolbar: "#141725", header: "#1a1f32", border: "#333b5a", text: "#f1f3ff", muted: "#aeb4cc", accent: "#8ea0ff" }
      }),
      daybreak: themePreset({
        label: "Daybreak", mode: "light", bodyFont: themeFonts.dmSans, monoFont: themeFonts.jetBrainsMono,
        ui: { bg: "#f4f8fb", panel: "#ffffff", border: "#cddbe7", text: "#172432", muted: "#607284", accent: "#2563eb" },
        docs: { bg: "#fbfdff", panel: "#ffffff", border: "#d7e3ef", text: "#182536", muted: "#667589", link: "#2563eb", code: "#eaf2fb" },
        terminal: { bg: "#f8fafc", pane: "#eef4fa", toolbar: "#e6edf5", header: "#f1f6fb", border: "#cad7e4", text: "#17202c", muted: "#64748b", accent: "#2563eb" }
      }),
      archive: themePreset({
        label: "Archive", mode: "light", bodyFont: themeFonts.ebGaramond, monoFont: themeFonts.sourceCodePro,
        ui: { bg: "#f7f3ea", panel: "#fffdf8", border: "#ddd2bf", text: "#28221a", muted: "#766b5e", accent: "#9a5f2d" },
        docs: { bg: "#fffaf1", panel: "#fffdf7", border: "#e2d5c0", text: "#2b2318", muted: "#766855", link: "#8e5528", code: "#f0e6d7" },
        terminal: { bg: "#fffaf2", pane: "#f2eadf", toolbar: "#ece1d3", header: "#f6eee4", border: "#dbcbb6", text: "#2b241b", muted: "#776a5b", accent: "#9a5f2d" }
      }),
      obsidian: themePreset({
        label: "Obsidian", mode: "dark", bodyFont: themeFonts.merriweather, monoFont: themeFonts.sometype,
        ui: { bg: "#141516", panel: "#1d1f20", border: "#363a3b", text: "#eeeeea", muted: "#a5aaa8", accent: "#9dc4ff" },
        docs: { bg: "#151617", panel: "#202223", border: "#383c3e", text: "#f0ede5", muted: "#b1aaa0", link: "#9dc4ff", code: "#2a2c2d" },
        terminal: { bg: "#0c0d0e", pane: "#08090a", toolbar: "#111314", header: "#17191b", border: "#303438", text: "#f2f4f3", muted: "#a8b0ae", accent: "#9dc4ff" }
      }),
      ember: themePreset({
        label: "Ember", mode: "dark", bodyFont: themeFonts.sourceSans, monoFont: themeFonts.ibmMono,
        ui: { bg: "#1a1411", panel: "#241d18", border: "#45362d", text: "#f4eee8", muted: "#b6a79d", accent: "#ef8354" },
        docs: { bg: "#1b1512", panel: "#261e19", border: "#49382e", text: "#f5eadf", muted: "#bda99a", link: "#f2a06f", code: "#33271f" },
        terminal: { bg: "#120d0a", pane: "#0c0806", toolbar: "#1a120e", header: "#221813", border: "#493428", text: "#fbefe6", muted: "#bea99b", accent: "#ef8354" }
      }),
      nocturne: themePreset({
        label: "Nocturne", mode: "dark", bodyFont: themeFonts.newsreader, monoFont: themeFonts.spaceMono,
        ui: { bg: "#18151b", panel: "#221e27", border: "#403746", text: "#f1edf3", muted: "#afa3b8", accent: "#d497ff" },
        docs: { bg: "#1a161d", panel: "#241f28", border: "#44394a", text: "#f2eadf", muted: "#b9aa9d", link: "#d497ff", code: "#332a32" },
        terminal: { bg: "#130f15", pane: "#0d0a0f", toolbar: "#1a141d", header: "#211926", border: "#433549", text: "#f5edf5", muted: "#b8a8bd", accent: "#d497ff" }
      }),
      graphite: themePreset({
        label: "Graphite", mode: "dark", bodyFont: themeFonts.montserrat, monoFont: themeFonts.sometype,
        ui: { bg: "#171819", panel: "#202224", border: "#3a3f43", text: "#f0f2f2", muted: "#a6adb1", accent: "#7dd3a8" },
        docs: { bg: "#17191a", panel: "#222426", border: "#3c4145", text: "#edf1ee", muted: "#aab2ad", link: "#7dd3a8", code: "#2a2d2f" },
        terminal: { bg: "#0d0f10", pane: "#090a0b", toolbar: "#121516", header: "#181c1e", border: "#333a3d", text: "#eef5f1", muted: "#a7b2ad", accent: "#7dd3a8" }
      }),
      aubergine: themePreset({
        label: "Aubergine", mode: "dark", bodyFont: themeFonts.instrument, monoFont: themeFonts.ibmMono,
        ui: { bg: "#1c141a", panel: "#261d24", border: "#493644", text: "#f5edf2", muted: "#b8a5b0", accent: "#ff8fb3" },
        docs: { bg: "#1d151b", panel: "#292027", border: "#4d3948", text: "#f4e9ee", muted: "#b9a5ae", link: "#ff8fb3", code: "#352830" },
        terminal: { bg: "#130d11", pane: "#0d090c", toolbar: "#1b1218", header: "#241920", border: "#4b3544", text: "#f8edf3", muted: "#bca8b4", accent: "#ff8fb3" }
      }),
      cobalt: themePreset({
        label: "Cobalt", mode: "dark", bodyFont: themeFonts.inter, monoFont: themeFonts.spaceMono,
        ui: { bg: "#111827", panel: "#1b2433", border: "#334158", text: "#eff4ff", muted: "#a7b2c7", accent: "#60a5fa" },
        docs: { bg: "#121a2a", panel: "#1c2638", border: "#34445f", text: "#eef4ff", muted: "#aab6cd", link: "#93c5fd", code: "#253149" },
        terminal: { bg: "#0b1020", pane: "#070b16", toolbar: "#10172a", header: "#17213a", border: "#33415f", text: "#eff6ff", muted: "#a9b7cf", accent: "#60a5fa" }
      }),
      basalt: themePreset({
        label: "Basalt", mode: "dark", bodyFont: themeFonts.notoSans, monoFont: themeFonts.firaCode,
        ui: { bg: "#121417", panel: "#1c2024", border: "#343b42", text: "#eef2f4", muted: "#a8b0b7", accent: "#38bdf8" },
        docs: { bg: "#13161a", panel: "#1f2429", border: "#374049", text: "#edf3f6", muted: "#a9b3bb", link: "#7dd3fc", code: "#293039" },
        terminal: { bg: "#090c10", pane: "#07090c", toolbar: "#10151a", header: "#171e25", border: "#303b45", text: "#eff6fb", muted: "#a9b4bd", accent: "#38bdf8" }
      }),
      velvet: themePreset({
        label: "Velvet", mode: "dark", bodyFont: themeFonts.cormorant, monoFont: themeFonts.robotoMono,
        ui: { bg: "#19131a", panel: "#241c26", border: "#44364a", text: "#f5eff7", muted: "#b7a8be", accent: "#c084fc" },
        docs: { bg: "#1a141c", panel: "#261f2a", border: "#47394e", text: "#f3edf5", muted: "#b8aabc", link: "#d8b4fe", code: "#322938" },
        terminal: { bg: "#100b12", pane: "#0b080d", toolbar: "#18101b", header: "#211729", border: "#44324e", text: "#f7effa", muted: "#b9a8c2", accent: "#c084fc" }
      })
    },
    customTokens: {}
  },
  soul: {
    principles: [
      "HyperWiki is Localhost Tooling for docs-driven agentic development.",
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
    return normalizeBuiltInPresets(structuredClone(defaultSettings));
  }
  const parsed = JSON.parse(await readFile(settingsPath, "utf8"));
  return normalizeBuiltInPresets(mergeSettings(defaultSettings, parsed));
}

export async function writeSettings(settings) {
  const next = normalizeBuiltInPresets(mergeSettings(defaultSettings, settings));
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

function normalizeBuiltInPresets(settings) {
  settings.theme ||= {};
  settings.theme.presets = structuredClone(defaultSettings.theme.presets);
  return settings;
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
