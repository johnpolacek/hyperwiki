import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hyperwikiApi, withProjectQuery } from "@/lib/api";
import { cn, DISABLE_TEXT_CORRECTION_PROPS } from "@/lib/utils";
import type { ProjectEnvEditorState, ProjectEnvResponse, ProjectEnvStatusTone, ProjectRecord } from "@/lib/types";

export const PROJECT_ENV_AUTOSAVE_DELAY_MS = 900;

export function ProjectEnvEditor({
  activeProject,
  initialKey,
  onClose,
  onSaved,
  open,
  reason,
}: {
  activeProject: ProjectRecord | null;
  initialKey?: string;
  onClose: () => void;
  onSaved: (keys: string[]) => void;
  open: boolean;
  reason?: string;
}) {
  const [summary, setSummary] = useState<ProjectEnvResponse | null>(null);
  const [rows, setRows] = useState<Array<{ id: string; name: string; present: boolean; source: string; value: string }>>([]);
  const [focusedValueRows, setFocusedValueRows] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<ProjectEnvStatusTone>("neutral");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedSignatureRef = useRef("");

  useEffect(() => {
    if (!open || !activeProject) return;
    let cancelled = false;
    setIsLoading(true);
    setStatus("Loading project env...");
    setStatusTone("neutral");
    hyperwikiApi
      .json<ProjectEnvResponse>(withProjectQuery("/api/project-env", activeProject))
      .then((response) => {
        if (cancelled) return;
        setSummary(response);
        setRows(projectEnvRows(response, initialKey));
        setFocusedValueRows({});
        setRevealed({});
        setStatus("");
        setStatusTone("neutral");
        lastSavedSignatureRef.current = "";
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(error instanceof Error ? error.message : "Could not load project env.");
        setStatusTone("error");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id, initialKey, open]);

  const activePath = summary?.envFile || (activeProject ? `${activeProject.root}/.env.local` : ".env.local");
  const dirtyRows = rows
    .map((row) => ({ name: row.name.trim(), value: row.value }))
    .filter((row) => row.name && row.value.length > 0);
  const hasInvalidKey = rows.some((row) => row.name.trim() && !isValidEnvKeyName(row.name.trim()));
  const canSave = Boolean(activeProject) && dirtyRows.length > 0 && !hasInvalidKey && !isSaving && !isLoading;
  const saveLabel = summary?.gitIgnored ? "Save now" : "Add .env.local to .gitignore and save";
  const dirtySignature = dirtyRows.map((row) => `${row.name}\0${row.value}`).join("\0\0");

  useEffect(() => {
    if (!open || !canSave || !dirtySignature || dirtySignature === lastSavedSignatureRef.current) return;
    const timeout = window.setTimeout(() => {
      void save(!summary?.gitIgnored, "auto");
    }, PROJECT_ENV_AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [canSave, dirtySignature, open, summary?.gitIgnored]);

  if (!open) return null;

  function updateRow(id: string, patch: Partial<{ name: string; value: string }>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addRow(name = "") {
    setRows((current) => [...current, { id: crypto.randomUUID(), name, present: false, source: "custom", value: "" }]);
  }

  async function save(addGitignore: boolean, mode: "auto" | "manual" = "manual") {
    if (!activeProject || !canSave) return;
    setIsSaving(true);
    setStatus(mode === "auto"
      ? summary?.gitIgnored ? "Autosaving .env.local..." : "Adding .env.local to .gitignore and autosaving..."
      : summary?.gitIgnored ? "Saving .env.local..." : "Updating .gitignore and saving .env.local...");
    setStatusTone("neutral");
    try {
      const saved = await hyperwikiApi.json<ProjectEnvResponse>(withProjectQuery("/api/project-env", activeProject), {
        method: "PUT",
        body: {
          addGitignore,
          entries: dirtyRows,
        },
      });
      const savedNames = new Set(dirtyRows.map((row) => row.name));
      setSummary(saved);
      setRows((current) => current.map((row) => savedNames.has(row.name.trim()) ? { ...row, present: true, source: ".env.local" } : row));
      setFocusedValueRows({});
      lastSavedSignatureRef.current = dirtySignature;
      setStatus(mode === "auto"
        ? "Saved"
        : reason === "terminal-detected"
        ? "Saved. Rerun the blocked command or restart the affected terminal."
        : "Saved. Restart any running process that needs the new value.");
      setStatusTone("success");
      onSaved(dirtyRows.map((row) => row.name));
    } catch (error) {
      lastSavedSignatureRef.current = "";
      setStatus(error instanceof Error ? error.message : "Could not save project env.");
      setStatusTone("error");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="project-env-title" className="fixed bottom-3 left-3 z-50 flex max-h-[min(720px,calc(100vh-24px))] w-[min(560px,calc(100vw-24px))] origin-bottom-left flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-pop md:bottom-4 md:left-4 md:max-h-[min(720px,calc(100vh-32px))] md:w-[min(560px,calc(100vw-32px))]" role="dialog">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b p-4">
        <div className="min-w-0">
          <h2 className="m-0 flex items-center gap-2 text-base font-semibold tracking-tight" id="project-env-title">
            <KeyRound data-icon="inline-start" />
            Project Env
          </h2>
          <p className="m-0 mt-2 truncate text-sm text-muted-foreground">{activePath}</p>
        </div>
        <Button size="icon" variant="ghost" type="button" onClick={onClose} aria-label="Close project env editor">
          <X aria-hidden="true" data-icon="inline-start" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!activeProject ? (
          <p className="m-0 text-sm text-muted-foreground">Open a project before editing env vars.</p>
        ) : (
          <div className="grid gap-4">
            {summary && !summary.gitIgnored ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-foreground">
                <strong className="block">Git ignore required</strong>
                <span className="mt-1 block text-muted-foreground">Hyperwiki will add <code>.env.local</code> to <code>.gitignore</code> before saving these local secrets.</span>
              </div>
            ) : null}
            {initialKey ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Detected key</span>
                <code className="ml-2">{initialKey}</code>
              </div>
            ) : null}
            <div className="grid gap-3">
              {rows.map((row) => {
                const invalid = Boolean(row.name.trim()) && !isValidEnvKeyName(row.name.trim());
                const showingStoredMask = row.present && !row.value && !focusedValueRows[row.id];
                return (
                  <div className="grid min-w-0 gap-3 rounded-md border bg-background p-3" key={row.id}>
                    <label className="grid min-w-0 gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key</span>
                      <input
                        {...DISABLE_TEXT_CORRECTION_PROPS}
                        aria-invalid={invalid}
                        className={cn("h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50", invalid && "border-destructive")}
                        onChange={(event) => updateRow(row.id, { name: event.target.value })}
                        title={row.name}
                        value={row.name}
                      />
                      <span className={cn("min-h-4 text-[11px]", row.present ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                        {row.present ? "value set in .env.local" : row.source}
                      </span>
                    </label>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                      <label className="grid min-w-0 gap-1">
                        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Value
                          {row.present ? <strong className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">set</strong> : null}
                        </span>
                        <input
                          {...DISABLE_TEXT_CORRECTION_PROPS}
                          className="h-9 min-w-0 rounded-md border border-input bg-background px-2 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          onChange={(event) => updateRow(row.id, { value: event.target.value })}
                          onBlur={() => setFocusedValueRows((current) => ({ ...current, [row.id]: false }))}
                          onFocus={() => setFocusedValueRows((current) => ({ ...current, [row.id]: true }))}
                          placeholder={row.present ? "Paste to replace saved value" : "Paste value"}
                          type={showingStoredMask || revealed[row.id] ? "text" : "password"}
                          value={showingStoredMask ? "****************" : row.value}
                        />
                        <span className="min-h-4 text-[11px] text-muted-foreground">{row.present ? "Secret is saved locally. Paste a new value only if you want to replace it." : ""}</span>
                      </label>
                      <Button className="mt-5" size="icon" variant="outline" type="button" onClick={() => setRevealed((current) => ({ ...current, [row.id]: !current[row.id] }))} aria-label={revealed[row.id] ? "Hide value" : "Reveal value"}>
                        {revealed[row.id] ? <EyeOff aria-hidden="true" data-icon="inline-start" /> : <Eye aria-hidden="true" data-icon="inline-start" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" type="button" onClick={() => addRow()}>
                <Plus data-icon="inline-start" />
                Add key
              </Button>
              {summary?.suggestedKeys.filter((key) => !rows.some((row) => row.name === key.name)).slice(0, 6).map((key) => (
                <Button key={key.name} size="sm" variant="ghost" type="button" onClick={() => addRow(key.name)}>
                  {key.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      <footer className="flex shrink-0 flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn("m-0 flex min-w-0 items-center gap-2 text-sm text-muted-foreground", statusTone === "success" && "text-emerald-700 dark:text-emerald-400", statusTone === "error" && "text-destructive")} role="status">
          {statusTone === "success" ? <Check aria-hidden="true" data-icon="inline-start" /> : null}
          <span className="min-w-0 truncate">{status || (dirtyRows.length ? "Autosaves after a short pause." : summary?.envFileExists ? ".env.local exists" : ".env.local will be created")}</span>
        </p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          <Button disabled={!canSave} type="button" onClick={() => save(!summary?.gitIgnored)}>
            {isSaving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {saveLabel}
          </Button>
        </div>
      </footer>
    </section>
  );
}

export function projectEnvRows(response: ProjectEnvResponse, initialKey?: string) {
  const byName = new Map<string, { name: string; present: boolean; source: string; value: string }>();
  for (const key of [...(response.suggestedKeys || []), ...(response.keys || [])]) {
    if (!key.name || byName.has(key.name)) continue;
    byName.set(key.name, {
      name: key.name,
      present: key.present,
      source: key.source || "suggested",
      value: "",
    });
  }
  const trimmedInitial = initialKey?.trim();
  if (trimmedInitial && !byName.has(trimmedInitial)) {
    byName.set(trimmedInitial, {
      name: trimmedInitial,
      present: false,
      source: "detected",
      value: "",
    });
  }
  const rows = Array.from(byName.values())
    .sort((left, right) => Number(right.name === trimmedInitial) - Number(left.name === trimmedInitial) || left.name.localeCompare(right.name))
    .map((row) => ({ ...row, id: crypto.randomUUID() }));
  return rows.length ? rows : [{ id: crypto.randomUUID(), name: trimmedInitial || "", present: false, source: trimmedInitial ? "detected" : "custom", value: "" }];
}

export function isValidEnvKeyName(name: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}
