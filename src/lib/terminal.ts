import type { Terminal } from "@xterm/xterm";
import { hyperwikiApi, withProjectQuery } from "@/lib/api";
import { appendImportLog } from "@/lib/import-log";
import type { AppPreviewResponse, DroppedFilesResponse, ProjectRecord, SessionRecord, TerminalCompletionEventPayload, TerminalOutputEventPayload } from "@/lib/types";

export const terminalXtermScrollback = 100000;

export function terminalClipboardImageFiles(data: DataTransfer | null) {
  if (!data) return [];
  const itemFiles = Array.from(data.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
  if (itemFiles.length) return itemFiles;
  return Array.from(data.files || []).filter((file) => file.type.startsWith("image/"));
}

export async function saveTerminalDroppedFiles(activeProject: ProjectRecord | null, files: File[]) {
  const response = await hyperwikiApi.json<DroppedFilesResponse>(withProjectQuery("/api/terminal/drop", activeProject), {
    method: "POST",
    body: {
      files: await Promise.all(files.map(async (file, index) => ({
        name: terminalPasteImageFileName(file, index),
        content: await fileToBase64(file),
      }))),
    },
  });
  return (response.files || [])
    .map((file) => String(file.path || "").trim())
    .filter(Boolean);
}

export function terminalPasteImageFileName(file: File, index: number) {
  if (file.name.trim()) return file.name;
  const extension = file.type === "image/jpeg"
    ? "jpg"
    : file.type === "image/webp"
      ? "webp"
      : file.type === "image/gif"
        ? "gif"
        : "png";
  return `pasted-image-${index + 1}.${extension}`;
}

export async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function terminalBracketedPaste(text: string) {
  return `\x1b[200~${text}\x1b[201~`;
}

export function isPendingTerminalSession(session: SessionRecord) {
  return session.status === "starting" || session.status === "failed";
}

export function terminalPaneLabel(session: SessionRecord, index: number) {
  const label = (session.role || session.name || `terminal ${index + 1}`).toLowerCase();
  return `${label} --`;
}

export function terminalPaneStatusLabel(session: SessionRecord) {
  if (isDetachedDevSession(session)) return "detached";
  if (isPendingTerminalSession(session)) return session.status === "failed" ? "failed" : "starting";
  if (isLiveTerminalSession(session)) return "running";
  return session.status || "unknown";
}

export function terminalCollapsedSummary(session: SessionRecord) {
  if (isDetachedDevSession(session)) return "Dev process is still running. Terminal output cannot be replayed after restart.";
  if (isPendingTerminalSession(session)) return session.command || session.shell || "Terminal is starting.";
  return session.command || session.cwd || session.shell || session.id;
}

export function terminalStartupNotice(session: SessionRecord) {
  if (isStandbySession(session)) return "";
  if (session.role === "agent") return "Starting agent terminal";
  if (session.role === "dev") return "Starting dev terminal";
  if (!session.command) return "";
  return "Starting terminal";
}

export function isDetachedDevSession(session: SessionRecord) {
  return session.role === "dev" && session.status === "detached";
}

export function isVisibleTerminalPaneSession(session: SessionRecord) {
  return (isLiveTerminalSession(session) || isPendingTerminalSession(session) || isDetachedDevSession(session)) && !isStandbySession(session);
}

export function selectDevTerminalSession(sessions: SessionRecord[], preview?: AppPreviewResponse | null) {
  const visible = sessions.filter(isVisibleTerminalPaneSession);
  const managedId = preview?.managedSession?.id || "";
  if (managedId) {
    const managed = visible.find((session) => session.id === managedId);
    if (managed) return managed;
  }
  return newestSession(visible.filter((session) => session.role === "dev"));
}

export function previewDetachedDevSession(preview?: AppPreviewResponse | null, activeProject?: ProjectRecord | null): SessionRecord | null {
  const managed = preview?.managedSession;
  if (!preview?.running || !managed?.id) return null;
  return {
    id: managed.id,
    name: "dev",
    kind: "pty",
    status: managed.status || "detached",
    mode: "terminal",
    role: "dev",
    command: preview.startCommand || null,
    shell: null,
    pid: managed.pid || managed.conflictPid || null,
    cwd: activeProject?.root || null,
    scope: "global",
    scopeKind: "global",
    planPath: null,
    visibility: "visible",
    connectedClients: 0,
    retained: true,
    reconnectable: false,
  };
}

export function worktreePreviewForSlug(root: string, slug: string) {
  const normalized = root.replace(/\/+$/g, "");
  if (!normalized) return `../worktrees/${slug}`;
  const parts = normalized.split("/");
  const base = parts.pop() || "project";
  const parent = parts.join("/") || "/";
  return `${parent}/${base}.worktrees/${slug}`;
}

export async function sendInput(sessionId: string, input: string) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/write`, {
    method: "POST",
    body: { input },
  });
}

export async function sendResize(sessionId: string, cols: number, rows: number) {
  await hyperwikiApi.json(`/api/terminal/${encodeURIComponent(sessionId)}/resize`, {
    method: "POST",
    body: { cols, rows },
  });
}

export type TauriEvent = {
  payload?: unknown;
};

export type TauriEventGlobal = typeof globalThis & {
  __TAURI__?: {
    event?: {
      listen?: (event: string, handler: (event: TauriEvent) => void) => Promise<() => void>;
    };
  };
};

export async function listenTerminalOutput(handler: (payload: TerminalOutputEventPayload) => void) {
  const listen = (globalThis as TauriEventGlobal).__TAURI__?.event?.listen;
  if (typeof listen !== "function") {
    throw new Error("Tauri event transport is unavailable for terminal output.");
  }
  return listen("terminal://output", (event) => {
    const payload = event.payload as Partial<TerminalOutputEventPayload> | null;
    if (!payload || typeof payload.sessionId !== "string" || typeof payload.seq !== "number" || !Array.isArray(payload.bytes)) return;
    handler({
      sessionId: payload.sessionId,
      seq: payload.seq,
      bytes: payload.bytes.filter((value): value is number => Number.isInteger(value) && value >= 0 && value <= 255),
    });
  });
}

export async function listenTerminalCompletion(handler: (payload: TerminalCompletionEventPayload) => void) {
  const listen = (globalThis as TauriEventGlobal).__TAURI__?.event?.listen;
  if (typeof listen !== "function") {
    throw new Error("Tauri event transport is unavailable for terminal completion.");
  }
  return listen("terminal://completion", (event) => {
    const payload = event.payload as Partial<TerminalCompletionEventPayload> | null;
    if (!payload || typeof payload.sessionId !== "string" || (payload.reason !== "process-exit" && payload.reason !== "agent-ready")) return;
    handler({
      sessionId: payload.sessionId,
      role: typeof payload.role === "string" ? payload.role : null,
      name: typeof payload.name === "string" ? payload.name : null,
      scope: typeof payload.scope === "string" ? payload.scope : null,
      planPath: typeof payload.planPath === "string" ? payload.planPath : null,
      reason: payload.reason,
      exitCode: typeof payload.exitCode === "number" ? payload.exitCode : null,
      completedAt: typeof payload.completedAt === "string" ? payload.completedAt : new Date().toISOString(),
    });
  });
}

export function terminalBytesToText(bytes: Uint8Array) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function cleanInitialTerminalDisplayText(data: string, initialBuffer: { current: string | null }) {
  if (initialBuffer.current === null) return data;
  const combined = `${initialBuffer.current}${data}`;
  const markerMatch = combined.match(/^\r?%[ \t]*(?:\r\n?|\n)/);
  if (markerMatch) {
    initialBuffer.current = null;
    return combined.slice(markerMatch[0].length);
  }
  if (/^\r?%[ \t]*$/.test(combined)) {
    initialBuffer.current = combined;
    return "";
  }
  initialBuffer.current = null;
  return combined;
}

export function terminalDisplayTextForXterm(data: string, carry: { current: string }) {
  return stripTerminalDisplayControlSequences(data, carry);
}

export function terminalDisplayHasVisibleText(data: string) {
  return stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n")
    .trim()
    .length > 0;
}

export function terminalDisplayDebugTail(data: string) {
  return terminalPlainTextForLog(data)
    || terminalTextForParsing(data).replace(/[ \t]+/g, " ").trim().slice(-500);
}

export async function openTerminalWebLink(uri: string) {
  try {
    await hyperwikiApi.request("/api/app/open-external", {
      method: "POST",
      body: { target: uri },
    });
  } catch (error) {
    console.error("Failed to open terminal link", error);
  }
}

export function terminalTranscriptTextForDisplay(data: string) {
  return terminalTextForParsing(data)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .filter(isUsefulTerminalLogLine)
    .join("\n");
}

export function appendTerminalTranscriptText(previous: string, next: string) {
  const trimmedNext = next.trim();
  if (!trimmedNext) return previous;
  const trimmedPrevious = previous.trim();
  if (!trimmedPrevious) return trimmedNext;
  if (trimmedPrevious.endsWith(trimmedNext)) return previous;
  const previousTail = trimmedPrevious.slice(-1200);
  if (previousTail && trimmedNext.includes(previousTail)) {
    return trimmedNext;
  }
  return `${trimmedPrevious}\n${trimmedNext}`;
}

export function xtermRenderSnapshot(container: HTMLElement, terminal: Terminal): XtermRenderSnapshot {
  const containerRect = container.getBoundingClientRect();
  const element = terminal.element || (container.querySelector(".xterm") as HTMLElement | null);
  const terminalRect = element?.getBoundingClientRect();
  const style = element ? getComputedStyle(element) : null;
  const helperTextarea = container.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
  const domText = (container.querySelector(".xterm-rows")?.textContent
    || container.querySelector(".xterm-screen")?.textContent
    || element?.textContent
    || "");
  const domTextLength = domText.replace(/\s+/g, "").length;
  const canvases = Array.from(container.querySelectorAll("canvas"));
  let paintedPixels = 0;
  for (const canvas of canvases) {
    paintedPixels += countVisibleCanvasPixels(canvas, 220 - paintedPixels);
    if (paintedPixels >= 220) break;
  }
  const hasUsableGeometry = containerRect.width > 0 && containerRect.height > 0 && (terminalRect?.width || 0) > 0 && (terminalRect?.height || 0) > 0 && terminal.cols > 0 && terminal.rows > 0;
  const isElementVisible = !style || (style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0);
  const hasInteractiveInput = Boolean(helperTextarea && !helperTextarea.disabled && !helperTextarea.readOnly);
  const hasRenderedContent = paintedPixels >= 220 || domTextLength > 0;
  return {
    containerWidth: Math.round(containerRect.width),
    containerHeight: Math.round(containerRect.height),
    terminalWidth: Math.round(terminalRect?.width || 0),
    terminalHeight: Math.round(terminalRect?.height || 0),
    cols: terminal.cols,
    rows: terminal.rows,
    canvasCount: canvases.length,
    domTextLength,
    hasHelperTextarea: Boolean(helperTextarea),
    interactive: hasUsableGeometry && isElementVisible && hasInteractiveInput,
    paintedPixels,
    rendered: hasUsableGeometry && isElementVisible && hasRenderedContent,
    display: style?.display || "unknown",
    visibility: style?.visibility || "unknown",
    opacity: style?.opacity || "unknown",
  };
}

export function xtermRenderSnapshotSummary(snapshot: XtermRenderSnapshot) {
  return `container=${snapshot.containerWidth}x${snapshot.containerHeight} terminal=${snapshot.terminalWidth}x${snapshot.terminalHeight} cols=${snapshot.cols} rows=${snapshot.rows} canvases=${snapshot.canvasCount} paintedPixels=${snapshot.paintedPixels} domChars=${snapshot.domTextLength} helperTextarea=${snapshot.hasHelperTextarea} interactive=${snapshot.interactive} rendered=${snapshot.rendered} display=${snapshot.display} visibility=${snapshot.visibility} opacity=${snapshot.opacity}`;
}

export function terminalTextForParsing(data: string) {
  return stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n");
}

export function logTerminalPlainText(
  sessionId: string,
  label: string,
  chars: number,
  total: number | null,
  output: string,
  previous: { current: string },
) {
  const text = terminalPlainTextForLog(output);
  if (!text || text === previous.current) return;
  previous.current = text;
  const totalPart = total === null ? "" : ` total=${total}`;
  appendImportLog(`${label} session=${sessionId} chars=${chars}${totalPart} text=${text}`);
}

export function isStandbySession(session: SessionRecord) {
  return session.visibility === "standby";
}

export function isLiveTerminalSession(session: SessionRecord) {
  return session.status === "active";
}

export function newestSession(sessions: SessionRecord[]) {
  return sessions.reduce<SessionRecord | null>((newest, session) => {
    if (!newest) return session;
    const newestMs = sessionSortMs(newest);
    const currentMs = sessionSortMs(session);
    if (currentMs !== newestMs) return currentMs > newestMs ? session : newest;
    return session.id > newest.id ? session : newest;
  }, null);
}

export type XtermRenderSnapshot = {
  containerWidth: number;
  containerHeight: number;
  terminalWidth: number;
  terminalHeight: number;
  cols: number;
  rows: number;
  canvasCount: number;
  domTextLength: number;
  hasHelperTextarea: boolean;
  interactive: boolean;
  paintedPixels: number;
  rendered: boolean;
  display: string;
  visibility: string;
  opacity: string;
};

export function countVisibleCanvasPixels(canvas: HTMLCanvasElement, needed: number) {
  if (needed <= 0 || canvas.width <= 0 || canvas.height <= 0) return 0;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext("2d", { willReadFrequently: true });
  } catch {
    return 0;
  }
  if (!context) return 0;
  try {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3];
      if (alpha < 24) continue;
      if (isTerminalBackgroundPixel(pixels[index], pixels[index + 1], pixels[index + 2])) continue;
      count += 1;
      if (count >= needed) return count;
    }
    return count;
  } catch {
    return 0;
  }
}

export function stripTerminalDisplayControlSequences(data: string, carry?: { current: string }) {
  const raw = `${carry?.current || ""}${String(data || "")}`;
  const { complete, pending } = splitTrailingTerminalControlSequence(raw);
  if (carry) carry.current = pending;
  return complete.replace(/\x1b\[\?2026[hl]/g, "");
}

export function terminalPlainTextForLog(data: string) {
  const text = stripTerminalDisplayControlSequences(data)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/[\u001b\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r/g, "\n");
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(isUsefulTerminalLogLine)
    .slice(-16)
    .join("\\n")
    .slice(-1600);
}

export function isUsefulTerminalLogLine(line: string) {
  if (!line) return false;
  const normalized = line.replace(/^[-•]\s*/, "").trim();
  if (!normalized) return false;
  if (/^%+$/.test(normalized)) return false;
  if (/^(?:Wor|Work|Worki|Workin|Working|orking|rking|king|ing)$/.test(normalized)) return false;
  if (/^(?:[WM•\s]*Working|Working|M+|M M|S|l|g|\d+|[?;:\d\[\]HKl]+)$/.test(normalized)) return false;
  if (/(?:esc to interrupt|background terminals? running|\/ps to vi|ctrl \+ t to view transcript)/i.test(normalized)) return false;
  if (/^(?:\d{1,3};){1,}\d{1,3}[A-Za-z]?$/.test(normalized)) return false;
  if (/^(?:\d{1,3};){1,}\d{1,3};\d{1,3}m/.test(normalized)) return false;
  if (/^›\s*.*mplement\s+\{feature\}/i.test(line)) return false;
  if (/^gpt-[\w.-]+\s+\w+\s+·\s+/.test(line)) return false;
  if (/^model:\s|^directory:\s|^permissions:\s|^Tip:\s/.test(line)) return false;
  if (/^[-─]{8,}$/.test(line)) return false;
  if (/^[╭╰│╯─\s>_OpenAICodex().\w:-]+$/.test(line) && line.includes("Codex")) return false;
  if (/^(?:active|agent|pty|reconnectable)$/.test(line)) return false;
  return /[A-Za-z]{3,}/.test(line);
}

export function sessionSortMs(session: SessionRecord) {
  const parsed = session.createdAt ? Date.parse(session.createdAt) : Number.NaN;
  if (Number.isFinite(parsed)) return parsed;
  const idTimestamp = session.id.match(/(\d{10,})/)?.[1];
  return idTimestamp ? Number(idTimestamp) : 0;
}

export function isTerminalBackgroundPixel(red: number, green: number, blue: number) {
  return colorDistance(red, green, blue, 32, 35, 31) < 14
    || colorDistance(red, green, blue, 0, 0, 0) < 10
    || colorDistance(red, green, blue, 17, 19, 18) < 14;
}

export function splitTrailingTerminalControlSequence(data: string) {
  const escapeIndex = data.lastIndexOf("\x1b");
  if (escapeIndex === -1) return { complete: data, pending: "" };
  const suffix = data.slice(escapeIndex);
  if (suffix === "\x1b") return { complete: data.slice(0, escapeIndex), pending: suffix };
  if (suffix.startsWith("\x1b[")) {
    if (/^\x1b\[[0-?]*[ -/]*[@-~]$/.test(suffix)) return { complete: data, pending: "" };
    if (!/[@-~]/.test(suffix.slice(2).replace(/[0-?]/g, "").replace(/[ -/]/g, ""))) {
      return { complete: data.slice(0, escapeIndex), pending: suffix };
    }
  }
  if (suffix.startsWith("\x1b]") && !suffix.includes("\x07") && !suffix.includes("\x1b\\")) {
    return { complete: data.slice(0, escapeIndex), pending: suffix };
  }
  return { complete: data, pending: "" };
}

export function colorDistance(red: number, green: number, blue: number, targetRed: number, targetGreen: number, targetBlue: number) {
  return Math.abs(red - targetRed) + Math.abs(green - targetGreen) + Math.abs(blue - targetBlue);
}
