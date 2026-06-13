import type { SettingsResponse, ThemePreset } from "@/lib/types";

export interface NormalizedTheme {
  label: string;
  mode: string;
  tokens: {
    ui?: Record<string, string>;
    docs?: Record<string, string>;
    terminal?: Record<string, string>;
  };
}

// Standard terminal palettes used when the chosen terminal mode differs from
// the active preset's natural terminal lightness. The dark palette mirrors the
// historical hardcoded terminal chrome (and theme_css fallbacks); the light one
// is a neutral counterpart so a forced-light terminal still reads cleanly.
export const STANDARD_TERMINAL: Record<"light" | "dark", Record<string, string>> = {
  dark: { bg: "#272822", pane: "#111312", toolbar: "#171a18", header: "#1b1f1b", border: "#2c302d", text: "#eef2ec", muted: "#abb5ad" },
  light: { bg: "#eef0f2", pane: "#f6f7f9", toolbar: "#eceef1", header: "#f1f2f5", border: "#d7dadf", text: "#1f2329", muted: "#5c6470" },
};

// Standard UI palettes used when the chosen UI mode differs from the active
// preset's natural lightness. Values mirror the :root / .dark blocks in
// src/index.css so a forced mode override stays coherent. The preset accent
// always carries through.
export const STANDARD_UI: Record<"light" | "dark", Record<string, string>> = {
  light: { bg: "#f8f8f5", panel: "#ffffff", text: "#1f221e", muted: "#6b7066", border: "#e2e2da" },
  dark: { bg: "#131413", panel: "#1b1d1b", text: "#ebede9", muted: "#9ba19a", border: "#2a2d2a" },
};

export function effectiveTheme(theme?: SettingsResponse["theme"]): NormalizedTheme {
  const presets = theme?.presets || {};
  const preset = presets[theme?.activePreset || ""] || Object.values(presets)[0] || {};
  // The overall UI mode override lives under customTokens.ui.mode so it stays
  // independent of the terminal's own mode (customTokens.terminal.mode).
  const modeOverride = theme?.customTokens?.ui?.mode;
  return mergePreset(normalizePreset(preset), { label: hasThemeOverrides(theme) ? "Custom" : preset.label || "Custom", mode: modeOverride, tokens: theme?.customTokens || {} });
}

// The terminal's natural lightness, inferred from the preset's baked pane color.
export function naturalTerminalMode(terminal?: Record<string, string>): "light" | "dark" {
  const pane = normalizeColor(terminal?.pane || terminal?.bg, "#111312");
  return relativeLuminance(hexToRgb(pane)) > 0.45 ? "light" : "dark";
}

// The terminal's effective light/dark, resolved independently of the UI mode:
// an explicit dark/light wins, "match" follows the UI, and unset preserves the
// preset's natural terminal lightness.
export function resolveTerminalMode(theme: NormalizedTheme): "light" | "dark" {
  const raw = theme.tokens.terminal?.mode;
  if (raw === "light" || raw === "dark") return raw;
  if (raw === "match") return theme.mode === "dark" ? "dark" : "light";
  return naturalTerminalMode(theme.tokens.terminal);
}

export function applyAppTheme(themeSettings?: SettingsResponse["theme"]) {
  const theme = effectiveTheme(themeSettings);
  const ui = theme.tokens.ui || {};
  const docs = theme.tokens.docs || {};
  const terminal = theme.tokens.terminal || {};
  const root = document.documentElement;
  const accent = normalizeColor(ui.accent || docs.link || "#276ef1", "#276ef1");
  const presetBackground = normalizeColor(docs.bg || ui.bg || "#f8f8f5", "#f8f8f5");
  // When the resolved UI mode contradicts the preset's natural lightness, swap
  // the surface colors to a standard palette of that mode (the preset accent
  // still carries through); otherwise keep the preset's curated colors.
  const uiMode = theme.mode === "dark" ? "dark" : "light";
  const useStandardUi = uiMode !== (relativeLuminance(hexToRgb(presetBackground)) > 0.45 ? "light" : "dark");
  const standardUi = STANDARD_UI[uiMode];
  const background = useStandardUi ? standardUi.bg : presetBackground;
  const panel = useStandardUi ? standardUi.panel : normalizeColor(ui.panel || docs.panel || "#ffffff", "#ffffff");
  const foreground = useStandardUi ? standardUi.text : normalizeColor(ui.text || docs.text || "#1f221e", "#1f221e");
  const mutedForeground = useStandardUi ? standardUi.muted : normalizeColor(ui.muted || docs.muted || "#6b7066", "#6b7066");
  const border = useStandardUi ? standardUi.border : normalizeColor(ui.border || docs.border || "#e2e2da", "#e2e2da");
  const secondary = mixHex(accent, theme.mode === "dark" ? "#ffffff" : panel, theme.mode === "dark" ? 0.18 : 0.9);
  const muted = mixHex(mutedForeground, background, theme.mode === "dark" ? 0.68 : 0.84);
  const uiFont = cssFontValue(ui.sansFont || ui.font || docs.sansFont, "\"Rethink Sans\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif");
  const primaryFont = cssFontValue(docs.serifFont, "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif");
  const monoFont = cssFontValue(docs.monoFont, "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace");
  const terminalFont = cssFontValue(terminal.font, monoFont);
  const isDark = theme.mode === "dark";
  // Resolve the terminal palette independently of the UI mode. When the chosen
  // terminal mode matches the preset's natural lightness we keep the preset's
  // curated colors; otherwise we fall back to a standard palette of the chosen
  // lightness. The terminal accent always carries through.
  const terminalMode = resolveTerminalMode(theme);
  const standardTerminal = STANDARD_TERMINAL[terminalMode];
  const terminalPalette = terminalMode === naturalTerminalMode(terminal) ? { ...standardTerminal, ...terminal } : standardTerminal;
  // Quiet hover tone for ghost/outline controls; the saturated preset accent stays on --primary.
  const hover = mixHex(mutedForeground, panel, isDark ? 0.82 : 0.88);

  root.style.colorScheme = isDark ? "dark" : "light";
  root.classList.toggle("dark", isDark);
  try {
    window.localStorage.setItem("hyperwikiThemeMode", isDark ? "dark" : "light");
  } catch {
    // Pre-paint mode hint is best-effort.
  }
  setCssVars(root, {
    "--background": background,
    "--foreground": foreground,
    "--card": panel,
    "--card-foreground": foreground,
    "--popover": panel,
    "--popover-foreground": foreground,
    "--primary": accent,
    "--primary-foreground": readableTextOn(accent),
    "--secondary": secondary,
    "--secondary-foreground": readableTextOn(secondary),
    "--muted": muted,
    "--muted-foreground": mutedForeground,
    "--accent": hover,
    "--accent-foreground": foreground,
    "--border": border,
    "--input": border,
    "--ring": accent,
    "--ui-sans-font": uiFont,
    "--docs-serif-font": primaryFont,
    "--docs-mono-font": monoFont,
    "--terminal-font": terminalFont,
    "--sidebar-font": cssFontValue(ui.sidebarFont, uiFont),
    // Terminal surface tokens, resolved per the terminal's own mode above.
    // Standard-palette fallbacks mirror theme_css() in
    // src-tauri/src/domain/settings.rs so the app chrome and the
    // backend-served wiki/iframe CSS never diverge.
    "--terminal-bg": normalizeColor(terminalPalette.bg, standardTerminal.bg),
    "--terminal-pane": normalizeColor(terminalPalette.pane, standardTerminal.pane),
    "--terminal-toolbar": normalizeColor(terminalPalette.toolbar, standardTerminal.toolbar),
    "--terminal-header": normalizeColor(terminalPalette.header, standardTerminal.header),
    "--terminal-border": normalizeColor(terminalPalette.border, standardTerminal.border),
    "--terminal-text": normalizeColor(terminalPalette.text, standardTerminal.text),
    "--terminal-muted": normalizeColor(terminalPalette.muted, standardTerminal.muted),
    "--terminal-accent": normalizeColor(terminal.accent, "#9fd1ff"),
    // Diff line colors for plan CodeBlock language="diff" rendering.
    "--diff-add": isDark ? "#4ade80" : "#15803d",
    "--diff-remove": isDark ? "#f87171" : "#b91c1c",
  });
}

export function cssFontValue(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

export function setCssVars(element: HTMLElement, vars: Record<string, string>) {
  Object.entries(vars).forEach(([name, value]) => element.style.setProperty(name, value));
}

export function normalizePreset(preset?: ThemePreset): NormalizedTheme {
  const docs = { ...(preset?.tokens?.docs || {}) };
  const ui = { ...(preset?.tokens?.ui || {}) };
  ui.sansFont ||= "Rethink Sans, sans-serif";
  return {
    label: preset?.label || "Custom",
    mode: preset?.mode || "light",
    tokens: {
      ui,
      docs,
      terminal: { ...(preset?.tokens?.terminal || {}) },
    },
  };
}

export function mergePreset(base: NormalizedTheme, patch: Partial<NormalizedTheme>): NormalizedTheme {
  return {
    label: patch.label || base.label,
    mode: patch.mode || base.mode,
    tokens: {
      ui: { ...(base.tokens.ui || {}), ...(patch.tokens?.ui || {}) },
      docs: { ...(base.tokens.docs || {}), ...(patch.tokens?.docs || {}) },
      terminal: { ...(base.tokens.terminal || {}), ...(patch.tokens?.terminal || {}) },
    },
  };
}

export function hasThemeOverrides(theme?: SettingsResponse["theme"]) {
  return Object.values(theme?.customTokens || {}).some((surface) => Object.keys(surface || {}).length > 0);
}

export function themeJson(theme?: SettingsResponse["theme"] | null) {
  return JSON.stringify(theme || {});
}

export function selectThemePreset(theme: SettingsResponse["theme"], activePreset: string): SettingsResponse["theme"] {
  return {
    ...(theme || {}),
    activePreset,
    customTokens: {},
  };
}

export function updateThemeMode(theme: SettingsResponse["theme"], mode: string): SettingsResponse["theme"] {
  // Overall UI mode override; stored under ui.mode to stay independent of the
  // terminal's own mode (customTokens.terminal.mode).
  return { ...(theme || {}), customTokens: { ...(theme?.customTokens || {}), ui: { ...(theme?.customTokens?.ui || {}), mode } } };
}

export function updateThemeToken(theme: SettingsResponse["theme"], surface: "ui" | "docs" | "terminal", token: string, value: string): SettingsResponse["theme"] {
  return { ...(theme || {}), customTokens: { ...(theme?.customTokens || {}), [surface]: { ...(theme?.customTokens?.[surface] || {}), [token]: value } } };
}

export function fontStyle(value?: string) {
  return value?.includes("sans-serif") ? "sans" : "serif";
}

export function fontLabel(value?: string) {
  if (!value) return "Default";
  return value.split(",")[0].replaceAll("\"", "").trim();
}

export function normalizeColor(value?: string, fallback = "#4361ee") {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value || fallback : fallback;
}

export function readableTextOn(color: string) {
  return contrastRatio("#ffffff", color) >= contrastRatio("#111312", color) ? "#ffffff" : "#111312";
}

export function mixHex(a: string, b: string, amount: number) {
  const left = hexToRgb(normalizeColor(a));
  const right = hexToRgb(normalizeColor(b));
  return rgbToHex({
    r: Math.round(left.r * (1 - amount) + right.r * amount),
    g: Math.round(left.g * (1 - amount) + right.g * amount),
    b: Math.round(left.b * (1 - amount) + right.b * amount),
  });
}

export function contrastRatio(a: string, b: string) {
  const left = relativeLuminance(hexToRgb(normalizeColor(a)));
  const right = relativeLuminance(hexToRgb(normalizeColor(b)));
  const light = Math.max(left, right);
  const dark = Math.min(left, right);
  return (light + 0.05) / (dark + 0.05);
}

export function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function hexToRgb(hex: string) {
  const normalized = normalizeColor(hex);
  return {
    r: Number.parseInt(normalized.slice(1, 3), 16),
    g: Number.parseInt(normalized.slice(3, 5), 16),
    b: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
