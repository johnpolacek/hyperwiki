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

export function effectiveTheme(theme?: SettingsResponse["theme"]): NormalizedTheme {
  const presets = theme?.presets || {};
  const preset = presets[theme?.activePreset || ""] || Object.values(presets)[0] || {};
  return mergePreset(normalizePreset(preset), { label: hasThemeOverrides(theme) ? "Custom" : preset.label || "Custom", tokens: theme?.customTokens || {} });
}

export function applyAppTheme(themeSettings?: SettingsResponse["theme"]) {
  const theme = effectiveTheme(themeSettings);
  const ui = theme.tokens.ui || {};
  const docs = theme.tokens.docs || {};
  const terminal = theme.tokens.terminal || {};
  const root = document.documentElement;
  const background = normalizeColor(docs.bg || ui.bg || "#f8f8f5", "#f8f8f5");
  const panel = normalizeColor(ui.panel || docs.panel || "#ffffff", "#ffffff");
  const foreground = normalizeColor(ui.text || docs.text || "#1f221e", "#1f221e");
  const mutedForeground = normalizeColor(ui.muted || docs.muted || "#6b7066", "#6b7066");
  const border = normalizeColor(ui.border || docs.border || "#e2e2da", "#e2e2da");
  const accent = normalizeColor(ui.accent || docs.link || "#276ef1", "#276ef1");
  const secondary = mixHex(accent, theme.mode === "dark" ? "#ffffff" : panel, theme.mode === "dark" ? 0.18 : 0.9);
  const muted = mixHex(mutedForeground, background, theme.mode === "dark" ? 0.68 : 0.84);
  const uiFont = cssFontValue(ui.sansFont || ui.font || docs.sansFont, "\"Rethink Sans\", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif");
  const primaryFont = cssFontValue(docs.serifFont, "\"Instrument Serif\", ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif");
  const monoFont = cssFontValue(docs.monoFont, "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace");
  const terminalFont = cssFontValue(terminal.font, monoFont);
  const isDark = theme.mode === "dark";
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
    // Terminal surface tokens. Fallbacks mirror theme_css() in
    // src-tauri/src/domain/settings.rs so the app chrome and the
    // backend-served wiki/iframe CSS never diverge.
    "--terminal-bg": normalizeColor(terminal.bg, "#272822"),
    "--terminal-pane": normalizeColor(terminal.pane, "#111312"),
    "--terminal-toolbar": normalizeColor(terminal.toolbar, "#171a18"),
    "--terminal-header": normalizeColor(terminal.header, "#1b1f1b"),
    "--terminal-border": normalizeColor(terminal.border, "#2c302d"),
    "--terminal-text": normalizeColor(terminal.text, "#eef2ec"),
    "--terminal-muted": normalizeColor(terminal.muted, "#abb5ad"),
    "--terminal-accent": normalizeColor(terminal.accent, "#9fd1ff"),
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
  return { ...(theme || {}), customTokens: { ...(theme?.customTokens || {}), ui: { ...(theme?.customTokens?.ui || {}) }, docs: { ...(theme?.customTokens?.docs || {}) }, terminal: { ...(theme?.customTokens?.terminal || {}), mode } } };
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
