import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, Check, ChevronRight, KeyRound, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { hyperwikiApi, withProjectQuery } from "@/lib/api";
import { terminalCompletionNotificationSettings } from "@/lib/terminal-notifications";
import { applyAppTheme, contrastRatio, effectiveTheme, fontLabel, fontStyle, hasThemeOverrides, mergePreset, mixHex, naturalTerminalMode, normalizeColor, normalizePreset, readableTextOn, selectThemePreset, themeJson, updateThemeMode, updateThemeToken, type NormalizedTheme } from "@/lib/theme";
import { cn, DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import type { MemoryEntry, ProjectRecord, SettingsResponse, TerminalCompletionNotificationSettings, ThemePreset } from "@/lib/types";

export const THEME_AUTOSAVE_DELAY_MS = 350;

export function SettingsView({ activeProject, onOpenProjectEnv, settings }: { activeProject: ProjectRecord | null; onOpenProjectEnv: (initialKey?: string, reason?: string) => void; settings: SettingsResponse | null }) {
  const [draft, setDraft] = useState<SettingsResponse | null>(settings);
  const [mode, setMode] = useState<"overview" | "theme" | "agent">("overview");
  const [themeDraft, setThemeDraft] = useState<SettingsResponse["theme"] | null>(settings?.theme || null);
  const [agentDraft, setAgentDraft] = useState<{ soul: SettingsResponse["soul"]; memory: SettingsResponse["memory"] } | null>(null);
  const [agentsFile, setAgentsFile] = useState<{ path: string; content: string }>({ path: "", content: "" });
  const [status, setStatus] = useState("");
  const currentDraftRef = useRef<SettingsResponse | null>(settings);
  const themeEditorBaselineRef = useRef<SettingsResponse["theme"] | null>(settings?.theme || null);
  const themeAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const themeAutosaveRequestRef = useRef(0);

  useEffect(() => {
    setDraft(settings);
    setThemeDraft(settings?.theme || null);
  }, [settings]);

  useEffect(() => {
    currentDraftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (mode !== "theme" || !draft || !themeDraft) return;
    applyAppTheme(themeDraft);
    if (themeJson(themeDraft) === themeJson(draft.theme)) return;

    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const requestId = ++themeAutosaveRequestRef.current;
    setStatus("Saving theme...");

    themeAutosaveTimerRef.current = setTimeout(async () => {
      const currentDraft = currentDraftRef.current;
      if (!currentDraft) return;
      try {
        const saved = await hyperwikiApi.json<SettingsResponse>("/api/settings", { method: "PUT", body: { ...currentDraft, theme: themeDraft } });
        if (requestId !== themeAutosaveRequestRef.current) return;
        applyAppTheme(saved.theme);
        setDraft(saved);
        setThemeDraft(saved.theme || null);
        setStatus("Theme autosaved.");
      } catch (error) {
        if (requestId !== themeAutosaveRequestRef.current) return;
        setStatus(error instanceof Error ? error.message : "Could not save theme.");
      }
    }, THEME_AUTOSAVE_DELAY_MS);

    return () => {
      if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    };
  }, [draft, mode, themeDraft]);

  useEffect(() => {
    return () => {
      if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode !== "agent" || !activeProject) return;
    let cancelled = false;
    setAgentsFile({ path: "Loading", content: "" });
    hyperwikiApi
      .json<{ path?: string; content?: string }>(withProjectQuery("/api/settings/agents-file", activeProject))
      .then((result) => {
        if (cancelled) return;
        const content = replaceManagedAgentsBlock(result.content || "", renderAgentsManagedBlock(agentDraft || { soul: draft?.soul, memory: draft?.memory }));
        setAgentsFile({ path: result.path || "AGENTS.md", content });
      })
      .catch((error) => {
        if (cancelled) return;
        setAgentsFile({ path: "Unavailable", content: error instanceof Error ? error.message : "Could not load AGENTS.md." });
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject, draft?.memory, draft?.soul, mode]);

  async function save(next: SettingsResponse, messages: { saving?: string; saved?: string } = {}) {
    setStatus(messages.saving || "Saving...");
    try {
      const saved = await hyperwikiApi.json<SettingsResponse>("/api/settings", { method: "PUT", body: next });
      applyAppTheme(saved.theme);
      setDraft(saved);
      setThemeDraft(saved.theme || null);
      setStatus(messages.saved || "Saved.");
      return saved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings.");
      return null;
    }
  }

  function openThemeEditor() {
    const baseline = structuredClone(draft?.theme || {});
    themeEditorBaselineRef.current = baseline;
    setThemeDraft(baseline);
    setMode("theme");
    setStatus("");
  }

  function openAgentEditor() {
    setAgentDraft({ soul: structuredClone(draft?.soul || {}), memory: structuredClone(draft?.memory || { entries: [] }) });
    setMode("agent");
    setStatus("");
  }

  async function revertTheme() {
    if (!draft) return;
    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const baseline = structuredClone(themeEditorBaselineRef.current || draft.theme || {});
    const requestId = ++themeAutosaveRequestRef.current;
    setMode("overview");
    setThemeDraft(baseline);
    const saved = await save({ ...draft, theme: baseline }, { saving: "Reverting theme...", saved: "Theme reverted." });
    if (!saved && requestId === themeAutosaveRequestRef.current) setMode("theme");
  }

  async function completeThemeEditor() {
    if (!draft || !themeDraft || themeJson(themeDraft) === themeJson(draft.theme)) {
      setMode("overview");
      return;
    }
    if (themeAutosaveTimerRef.current) clearTimeout(themeAutosaveTimerRef.current);
    const requestId = ++themeAutosaveRequestRef.current;
    const saved = await save({ ...draft, theme: themeDraft }, { saving: "Saving theme...", saved: "Theme autosaved." });
    if (saved && requestId === themeAutosaveRequestRef.current) setMode("overview");
  }

  async function saveAgentInstructions() {
    if (!draft || !agentDraft) return;
    const nextSoul = agentDraft.soul || {};
    const nextMemory = {
      entries: (agentDraft.memory?.entries || [])
        .map((entry) => ({
          id: entry.id || crypto.randomUUID(),
          title: String(entry.title || "").trim(),
          content: String(entry.content || "").trim(),
          enabled: entry.enabled !== false,
          updatedAt: new Date().toISOString(),
        }))
        .filter((entry) => entry.title || entry.content),
    };
    const saved = await save({ ...draft, soul: nextSoul, memory: nextMemory });
    if (!saved) return;
    if (activeProject) {
      setStatus("Syncing AGENTS.md...");
      const content = replaceManagedAgentsBlock(agentsFile.content, renderAgentsManagedBlock({ soul: nextSoul, memory: nextMemory }));
      try {
        await hyperwikiApi.json(withProjectQuery("/api/settings/sync-agents", activeProject), { method: "POST", body: { content } });
        setStatus("Agent instructions saved.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not sync AGENTS.md.");
        return;
      }
    }
    setMode("overview");
  }

  async function updateTerminalCompletionNotifications(next: Partial<TerminalCompletionNotificationSettings>) {
    if (!draft) return;
    const current = terminalCompletionNotificationSettings(draft.notifications);
    const notifications = {
      ...(draft.notifications || {}),
      terminalCompletion: {
        ...current,
        ...next,
      },
    };
    await save({ ...draft, notifications }, { saving: "Saving notifications...", saved: "Notification settings saved." });
  }

  if (!draft) {
    return (
      <section className="min-h-0 overflow-auto bg-background">
        <div className="min-h-full">
        <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." />
        <div className="m-8 border bg-card p-4 text-sm text-muted-foreground">Settings are unavailable.</div>
        </div>
      </section>
    );
  }

  const theme = effectiveTheme(draft.theme);
  const overviewMemory = draft.memory?.entries || [];
  const soul = draft.soul || {};

  if (mode === "theme") {
    const editableTheme = themeDraft || {};
    const editTheme = effectiveTheme(editableTheme);
    const presets = editableTheme.presets || {};
    return (
      <section className="min-h-0 overflow-auto bg-background">
        <div className="min-h-full">
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={revertTheme}>Revert</Button><Button onClick={completeThemeEditor}>Done</Button></>}
          description="Theme changes apply immediately and save automatically."
          title="Edit Theme"
        />
        <div className="grid min-w-0 gap-4 p-8">
          <ThemePresetCard large presetKey={editableTheme.activePreset || "custom"} theme={editTheme} />
          <ThemePresetStrip activePreset={editableTheme.activePreset || ""} onSelect={(key) => setThemeDraft(selectThemePreset(editableTheme, key))} presets={presets} />
          <div className="grid grid-cols-[minmax(360px,0.55fr)_minmax(420px,1fr)] gap-4 max-lg:grid-cols-1">
            <div className="rounded-lg border bg-card p-5 shadow-xs">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Mode
                <Select className="font-normal normal-case tracking-normal" value={editTheme.mode} onChange={(event) => setThemeDraft(updateThemeMode(editableTheme, event.target.value))}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </Select>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <ColorField label="Primary" value={editTheme.tokens.ui?.accent || "#4361ee"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "ui", "accent", value))} />
                <ColorField label="Terminal Accent" value={editTheme.tokens.terminal?.accent || editTheme.tokens.ui?.accent || "#4361ee"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "terminal", "accent", value))} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <SelectField label="Body Style" value={fontStyle(editTheme.tokens.docs?.serifFont)} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "docs", "serifFont", value === "sans" ? "Work Sans, sans-serif" : "Instrument Serif, serif"))} options={[["serif", "Serif"], ["sans", "Sans Serif"]]} />
                <SelectField label="Sidebar" value={editTheme.tokens.ui?.sidebarFont === editTheme.tokens.ui?.sansFont ? "body" : "mono"} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "ui", "sidebarFont", value === "body" ? editTheme.tokens.ui?.sansFont || "Rethink Sans, sans-serif" : editTheme.tokens.docs?.monoFont || "Space Mono, monospace"))} options={[["body", "UI font"], ["mono", "Mono font"]]} />
                <SelectField label="Mono Font" value={editTheme.tokens.docs?.monoFont || "Space Mono, monospace"} onChange={(value) => setThemeDraft(updateThemeToken(updateThemeToken(editableTheme, "docs", "monoFont", value), "terminal", "font", value))} options={[["Space Mono, monospace", "Space Mono"], ["IBM Plex Mono, monospace", "IBM Plex Mono"], ["Fira Code, monospace", "Fira Code"], ["Roboto Mono, monospace", "Roboto Mono"]]} />
                <SelectField label="Terminal Mode" value={editTheme.tokens.terminal?.mode || naturalTerminalMode(editTheme.tokens.terminal)} onChange={(value) => setThemeDraft(updateThemeToken(editableTheme, "terminal", "mode", value))} options={[["dark", "Dark"], ["light", "Light"], ["match", "Match UI"]]} />
              </div>
              <ThemeFontSummary theme={editTheme} />
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Advanced JSON</summary>
                <Textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="mt-2 min-h-40 font-mono text-xs font-normal normal-case tracking-normal" value={JSON.stringify(themeDraft, null, 2)} onChange={(event) => { try { setThemeDraft(JSON.parse(event.target.value)); setStatus(""); } catch { setStatus("Theme JSON is not valid."); } }} />
              </details>
            </div>
            <div className="grid rounded-lg border bg-card p-6 shadow-xs">
              <div className="grid grid-cols-[190px_1fr] gap-8">
                <div className="border-r pr-6 font-ui">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plans</p>
                  <p className="mt-3 text-sm">Stage 08 Settings</p>
                  <p className="mt-3 text-sm">Unit 02 - Theme System</p>
                </div>
                <div style={{ fontFamily: editTheme.tokens.docs?.serifFont }}>
                  <h2 className="text-4xl">Planning Preview</h2>
                  <p className="mt-4 max-w-xl text-2xl text-muted-foreground">Docs keep their reading voice while the UI stays dense and scannable.</p>
                  <code className="mt-5 inline-block bg-muted px-2 py-1 font-mono text-sm">wiki/plans/mvp/stage-08-settings-soul-memory.mdx</code>
                </div>
              </div>
            </div>
          </div>
        </div>
        <SettingsStatus status={status} />
        </div>
      </section>
    );
  }

  if (mode === "agent") {
    const editableAgent = agentDraft || { soul: draft.soul || {}, memory: draft.memory || { entries: [] } };
    return (
      <section className="min-h-0 overflow-auto bg-background">
        <div className="min-h-full">
        <SettingsPageHeader
          actions={<><Button variant="outline" onClick={() => { setAgentDraft(null); setMode("overview"); }}>Cancel</Button><Button onClick={saveAgentInstructions}>Save Agent Instructions</Button></>}
          description="Saving updates global instructions and syncs the current project AGENTS.md."
          title="Edit Agent Instructions"
        />
        <div className="grid gap-4 p-8">
          <div className="grid grid-cols-[minmax(360px,0.78fr)_minmax(320px,1fr)] gap-4 max-lg:grid-cols-1">
            <div className="rounded-lg border bg-card p-5 shadow-xs">
              <TextareaField label="Principles" value={(editableAgent.soul?.principles || []).join("\n")} rows={8} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), principles: value.split("\n").map((line) => line.trim()).filter(Boolean) } })} />
              <TextareaField label="Interface Guidance" value={editableAgent.soul?.interface || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), interface: value } })} />
              <TextareaField label="Agent Guidance" value={editableAgent.soul?.agent || ""} rows={5} onChange={(value) => setAgentDraft({ ...editableAgent, soul: { ...(editableAgent.soul || {}), agent: value } })} />
            </div>
            <div className="rounded-lg border bg-card p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memory</h2>
                <Button variant="outline" onClick={() => setAgentDraft({ ...editableAgent, memory: { entries: [...(editableAgent.memory?.entries || []), { title: "", content: "", enabled: true }] } })}>+ Memory</Button>
              </div>
              <div className="grid gap-3">
                {(editableAgent.memory?.entries || []).length ? (editableAgent.memory?.entries || []).map((entry, index) => (
                  <MemoryEditor entry={entry} index={index} key={entry.id || index} onChange={(next) => {
                    const entries = [...(editableAgent.memory?.entries || [])];
                    entries[index] = next;
                    setAgentDraft({ ...editableAgent, memory: { entries } });
                  }} onRemove={() => setAgentDraft({ ...editableAgent, memory: { entries: (editableAgent.memory?.entries || []).filter((_, itemIndex) => itemIndex !== index) } })} />
                )) : <p className="text-sm text-muted-foreground">No memory entries added yet.</p>}
              </div>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AGENTS.md</h2>
              <span className="truncate text-xs text-muted-foreground">{agentsFile.path || "AGENTS.md"}</span>
            </div>
            <Textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-[360px] font-mono text-xs leading-relaxed" value={agentsFile.content} onChange={(event) => setAgentsFile({ ...agentsFile, content: event.target.value })} />
          </div>
        </div>
        <SettingsStatus status={status} />
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-0 overflow-auto bg-background">
      <div className="min-h-full">
      <SettingsPageHeader title="Settings" description="Control global theme and agent instructions." />
      <div className="grid grid-cols-[minmax(480px,1.18fr)_minmax(340px,0.82fr)] gap-5 p-8 max-lg:grid-cols-1">
        <div className="rounded-lg border bg-card p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</h2>
            <Button variant="outline" onClick={openThemeEditor}>Edit</Button>
          </div>
          <div className="grid min-h-48 grid-cols-[minmax(0,1fr)_auto] items-end gap-5 rounded-md border bg-background p-7">
            <h3 className="font-docs m-0 text-4xl leading-none">{theme.label}</h3>
            <ThemeSwatches colors={[theme.tokens.ui?.bg, theme.tokens.ui?.panel, theme.tokens.ui?.accent, theme.tokens.docs?.bg, theme.tokens.docs?.link, theme.tokens.terminal?.bg, theme.tokens.terminal?.accent]} tall />
          </div>
          <div className="mt-4 grid gap-3">
            <ThemeSurfaceSummary label="UI" description="Sidebar and workspace chrome" tokens={theme.tokens.ui} fontKeys={[["UI Font", "sidebarFont"]]} />
            <ThemeSurfaceSummary label="Docs" description="Planning and wiki pages" tokens={theme.tokens.docs} fontKeys={[["Primary Font", "serifFont"], ["Mono Font", "monoFont"]]} />
            <ThemeSurfaceSummary label="Terminal" description="Pane chrome and session frames" tokens={theme.tokens.terminal} fontKeys={[["Font", "font"]]} />
          </div>
        </div>
        <div className="grid gap-5">
          <div className="rounded-lg border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-start gap-3">
              <Bell aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</h2>
                <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">Notify when a project terminal finishes while hyperwiki is not focused.</p>
              </div>
            </div>
            <div className="grid gap-3 text-sm">
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ enabled: event.target.checked })} />
                <span>Terminal completion notifications</span>
              </label>
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).sound} disabled={!terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ sound: event.target.checked })} />
                <span>Play system chime</span>
              </label>
              <label className="flex items-center gap-3">
                <input className="size-4 accent-primary" checked={terminalCompletionNotificationSettings(draft.notifications).onlyWhenUnfocused} disabled={!terminalCompletionNotificationSettings(draft.notifications).enabled} type="checkbox" onChange={(event) => void updateTerminalCompletionNotifications({ onlyWhenUnfocused: event.target.checked })} />
                <span>Only when hyperwiki is unfocused</span>
              </label>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-xs">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agent Instructions</h2>
              <Button variant="outline" onClick={openAgentEditor}>Edit</Button>
            </div>
            <div className="grid gap-3">
              <AgentSummaryCard title="Soul" meta={`${soul.principles?.length || 0} principles`} lines={(soul.principles || []).slice(0, 3)} />
              <AgentSummaryCard title="Agent" meta="Guidance" lines={[soul.agent || "No agent guidance recorded."]} />
              <AgentSummaryCard title="Memory" meta={`${overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).length} enabled`} lines={overviewMemory.filter((entry) => entry.enabled !== false && (entry.title || entry.content)).slice(0, 3).map((entry) => entry.title || entry.content || "")} />
            </div>
          </div>
          <div className="rounded-lg border bg-card p-5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project Env</h2>
                <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
                  Store local keys in the active checkout's <code>.env.local</code> without putting values into terminal history.
                </p>
                {activeProject ? <p className="m-0 mt-2 truncate text-xs text-muted-foreground">{activeProject.root}</p> : null}
              </div>
              <Button disabled={!activeProject} variant="outline" onClick={() => onOpenProjectEnv(undefined, "settings")}>
                <KeyRound data-icon="inline-start" />
                Env
              </Button>
            </div>
          </div>
        </div>
      </div>
      <SettingsStatus status={status} />
      </div>
    </section>
  );
}

export function SettingsPageHeader({ actions, description, title }: { actions?: ReactNode; description: string; title: string }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b px-8 py-8">
      <div>
        <h1 className="font-ui m-0 text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div> : null}
    </header>
  );
}

export function SettingsStatus({ status }: { status: string }) {
  if (!status) return null;
  return <p className="px-8 pb-6 text-sm text-muted-foreground" role="status">{status}</p>;
}

export function ThemeSurfaceSummary({ description, fontKeys, label, tokens }: { description: string; fontKeys: Array<[string, string]>; label: string; tokens?: Record<string, string> }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 rounded-md border bg-background p-4">
      <header>
        <strong className="block text-sm">{label}</strong>
        <span className="text-xs text-muted-foreground">{description}</span>
      </header>
      <div className="min-w-0">
        <ThemeSwatches colors={["bg", "panel", "muted", "text", "border", "accent"].map((key) => tokens?.[key])} />
        <dl className="mt-3 grid gap-2">
          {fontKeys.map(([name, key]) => (
            <div className="grid grid-cols-[160px_minmax(0,1fr)] items-baseline gap-3" key={key}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{name}</dt>
              <dd className="min-w-0">
                <span className="block text-xs font-bold text-muted-foreground">{fontLabel(tokens?.[key])}</span>
                <span className="block truncate text-2xl" style={{ fontFamily: tokens?.[key] }}>AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function ThemeSwatches({ colors, tall = false }: { colors: Array<string | undefined>; tall?: boolean }) {
  return (
    <span className={cn("flex justify-end gap-1", tall && "items-end gap-0")}>
      {colors.filter(Boolean).map((color, index) => (
        <span
          className={cn("block rounded-sm border", tall ? "h-24 w-9 rounded-none first:rounded-l-md last:rounded-r-md" : "size-5")}
          key={`${color}-${index}`}
          style={{ background: color }}
          title={color}
        />
      ))}
    </span>
  );
}

export function AgentSummaryCard({ lines, meta, title }: { lines: string[]; meta: string; title: string }) {
  const values = lines.filter(Boolean);
  return (
    <div className="rounded-md border bg-background p-3">
      <header className="mb-2 flex items-center justify-between gap-3">
        <strong>{title}</strong>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </header>
      <ul className="m-0 grid gap-1 pl-5 text-sm text-muted-foreground">
        {(values.length ? values : ["No entries added yet."]).map((line, index) => <li key={index}>{line}</li>)}
      </ul>
    </div>
  );
}

export function ThemePresetStrip({ activePreset, onSelect, presets }: { activePreset: string; onSelect: (key: string) => void; presets: Record<string, ThemePreset> }) {
  const entries = Object.entries(presets);
  if (!entries.length) return null;
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</h2>
        <span className="truncate text-xs text-muted-foreground">Choosing a preset applies and autosaves.</span>
      </div>
      <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1">
        {entries.map(([key, preset]) => {
          const theme = normalizePreset(preset);
          const selected = key === activePreset;
          return (
            <button
              aria-pressed={selected}
              className={cn(
                "grid w-52 shrink-0 gap-2 rounded-md border bg-background p-3 text-left hover:border-primary",
                selected && "border-primary ring-1 ring-primary/40",
              )}
              key={key}
              onClick={() => onSelect(key)}
              type="button"
            >
              <span className="flex items-center gap-1">
                {["bg", "panel", "accent"].map((token) => (
                  <i
                    aria-hidden="true"
                    className="block size-4 rounded-full border"
                    key={token}
                    style={{ background: theme.tokens.ui?.[token] || theme.tokens.docs?.[token] || "transparent" }}
                  />
                ))}
                <i aria-hidden="true" className="ml-auto block h-4 w-8 rounded-full border" style={{ background: theme.tokens.terminal?.bg || "transparent" }} />
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-sm" style={{ fontFamily: theme.tokens.docs?.serifFont }}>{theme.label || key}</strong>
                <span className="block truncate text-xs text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.monoFont }}>{key}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ThemePresetCard({ large = false, presetKey, theme }: { large?: boolean; presetKey: string; theme: NormalizedTheme }) {
  return (
    <div className={cn("grid min-w-0 grid-cols-[80px_minmax(0,1fr)] items-center gap-3", large && "grid-cols-[300px_minmax(0,1fr)] rounded-md border bg-card p-7")}>
      <span className={cn("relative block h-16 overflow-hidden rounded-md border bg-background", large && "h-52")}>
        <i className="absolute left-8 top-10 size-6 bg-primary" style={{ background: theme.tokens.ui?.accent }} />
        <b className="absolute left-24 top-12 h-2 w-28 bg-primary" style={{ background: theme.tokens.docs?.link || theme.tokens.ui?.accent }} />
        <em className="absolute left-24 top-20 h-2 w-36 bg-primary/30" style={{ background: theme.tokens.ui?.muted || theme.tokens.ui?.panel }} />
        <strong className="absolute bottom-0 right-0 h-16 w-56 bg-foreground" style={{ background: theme.tokens.terminal?.bg }} />
      </span>
      <span className="min-w-0">
        <strong className={cn("block truncate", large && "text-2xl")}>{theme.label || presetKey}</strong>
        {large ? (
          <span className="mt-6 grid grid-cols-2 gap-8 border-t pt-5">
            <span>
              <small className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Text</small>
              <b className="block truncate text-3xl" style={{ fontFamily: theme.tokens.docs?.serifFont }}>AaBbCcDdEeFfGgHhIiJjKkLlMm</b>
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog.</em>
            </span>
            <span>
              <small className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mono</small>
              <b className="block truncate text-3xl" style={{ fontFamily: theme.tokens.docs?.monoFont }}>AaBbCcDdEeFfGgHhIiJjKkLlMm</b>
              <em className="block truncate text-sm text-muted-foreground">The quick brown fox jumps over the lazy dog.</em>
            </span>
          </span>
        ) : (
          <>
            <span className="block truncate text-sm text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.serifFont }}>{fontLabel(theme.tokens.docs?.serifFont)}</span>
            <span className="block truncate text-sm text-muted-foreground" style={{ fontFamily: theme.tokens.docs?.monoFont }}>{fontLabel(theme.tokens.docs?.monoFont)}</span>
          </>
        )}
      </span>
    </div>
  );
}

export function ColorField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <input className="h-10 w-full rounded-md border bg-background px-1" type="color" value={normalizeColor(value)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function SelectField({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <Select className="font-normal normal-case tracking-normal" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </Select>
    </label>
  );
}

export function ThemeFontSummary({ theme }: { theme: NormalizedTheme }) {
  const fonts = [
    ["Body", theme.tokens.docs?.serifFont],
    ["Sidebar", theme.tokens.ui?.sidebarFont],
    ["Mono", theme.tokens.docs?.monoFont],
    ["Terminal", theme.tokens.terminal?.font],
  ];
  return (
    <dl className="mt-4 grid gap-2 rounded-md border bg-background p-3 text-xs">
      {fonts.map(([label, value]) => (
        <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-3" key={label}>
          <dt className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="min-w-0 truncate font-normal text-foreground" style={{ fontFamily: value }}>{fontLabel(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TextareaField({ label, onChange, rows, value }: { label: string; onChange: (value: string) => void; rows: number; value: string }) {
  return (
    <label className="mb-4 grid gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      <Textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="font-mono font-normal normal-case tracking-normal" rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function MemoryEditor({ entry, index, onChange, onRemove }: { entry: MemoryEntry; index: number; onChange: (entry: MemoryEntry) => void; onRemove: () => void }) {
  return (
    <article className="grid gap-2 rounded-md border bg-background p-3">
      <Input {...DISABLE_TEXT_CORRECTION_PROPS} placeholder={`Memory ${index + 1}`} value={entry.title || ""} onChange={(event) => onChange({ ...entry, title: event.target.value })} />
      <Textarea {...DISABLE_TEXT_CORRECTION_PROPS} className="min-h-20" placeholder="Memory" value={entry.content || ""} onChange={(event) => onChange({ ...entry, content: event.target.value })} />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <input className="size-4 accent-primary" checked={entry.enabled !== false} type="checkbox" onChange={(event) => onChange({ ...entry, enabled: event.target.checked })} />
          Enabled
        </label>
        <Button variant="outline" onClick={onRemove}>Remove</Button>
      </div>
    </article>
  );
}


export function renderAgentsManagedBlock(settings: { soul?: SettingsResponse["soul"]; memory?: SettingsResponse["memory"] }) {
  const soul = settings.soul || {};
  const principles = (soul.principles || []).filter(Boolean);
  const memories = (settings.memory?.entries || []).filter((entry) => entry.enabled !== false && String(entry.content || "").trim());
  return `<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->
## hyperwiki Global Context

### Soul

${principles.length ? principles.map((item) => `- ${item}`).join("\n") : "- No global soul principles recorded."}

Interface guidance: ${soul.interface || "Use hyperwiki's default interface guidance."}

Agent guidance: ${soul.agent || "Use hyperwiki's default agent guidance."}

### Memory

${memories.length ? memories.map((entry) => `- ${entry.title ? `${entry.title}: ` : ""}${entry.content}`).join("\n") : "- No approved global memory entries recorded."}
<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->`;
}

export function replaceManagedAgentsBlock(content: string, block: string) {
  const start = "<!-- HYPERWIKI-GLOBAL-CONTEXT:START v1 -->";
  const end = "<!-- HYPERWIKI-GLOBAL-CONTEXT:END -->";
  if (content.includes(start) && content.includes(end)) {
    return content.replace(new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`), block);
  }
  return `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${block}\n`;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
