import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import { hyperwikiApi } from "@/lib/api";
import { appendImportLog } from "@/lib/import-log";
import { terminalStartupNotice, appendTerminalTranscriptText, cleanInitialTerminalDisplayText, isPendingTerminalSession, listenTerminalOutput, logTerminalPlainText, openTerminalWebLink, saveTerminalDroppedFiles, sendInput, sendResize, terminalBracketedPaste, terminalBytesToText, terminalClipboardImageFiles, terminalDisplayDebugTail, terminalDisplayHasVisibleText, terminalDisplayTextForXterm, terminalTextForParsing, terminalTranscriptTextForDisplay, terminalXtermScrollback, xtermRenderSnapshot, xtermThemeFromCss, xtermRenderSnapshotSummary } from "@/lib/terminal";
import { cn } from "@/lib/utils";
import type { ProjectRecord, SessionRecord, TerminalOutputEventPayload, TerminalReplayResponse } from "@/lib/types";
export function XtermSession({
  activeProject,
  isActive,
  onTerminalText,
  session,
}: {
  activeProject: ProjectRecord | null;
  isActive: boolean;
  onTerminalText: (sessionId: string, text: string) => void;
  session: SessionRecord;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const seenSeqRef = useRef(0);
  const loggedPlainTextRef = useRef("");
  const emptyDisplayLogCountRef = useRef(0);
  const displayWriteLogCountRef = useRef(0);
  const renderCheckLogCountRef = useRef(0);
  const fitLogCountRef = useRef(0);
  const terminalTranscriptLogCountRef = useRef(0);
  const xtermEffectRunRef = useRef(0);
  const xtermRenderHealthyRef = useRef(false);
  const terminalTranscriptRef = useRef("");
  const initialDisplayBufferRef = useRef<string | null>("");
  const displayControlCarryRef = useRef({ current: "" });
  const pendingRef = useRef<string[]>([]);
  const closedRef = useRef(false);
  const flushingInputRef = useRef(false);
  const [startupNoticeVisible, setStartupNoticeVisible] = useState(false);
  const startupNotice = terminalStartupNotice(session);

  const flushPendingInput = useCallback(async function flushPendingInput() {
    if (flushingInputRef.current) return;
    flushingInputRef.current = true;
    try {
      while (!closedRef.current && pendingRef.current.length) {
        const input = pendingRef.current.shift() || "";
        try {
          await sendInput(session.id, input);
        } catch (error) {
          pendingRef.current = [];
          const message = error instanceof Error ? error.message : String(error);
          appendImportLog(`Terminal input failed session=${session.id}`, error);
          terminalRef.current?.write(`\r\n\x1b[31m[hyperwiki] terminal input failed: ${message}\x1b[0m\r\n`);
          break;
        }
      }
    } finally {
      flushingInputRef.current = false;
      if (!closedRef.current && pendingRef.current.length) void flushPendingInput();
    }
  }, [session.id]);

  const queueTerminalInput = useCallback((input: string) => {
    if (!input || closedRef.current) return;
    pendingRef.current.push(input);
    void flushPendingInput();
  }, [flushPendingInput]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const effectRun = xtermEffectRunRef.current + 1;
    xtermEffectRunRef.current = effectRun;
    const mountedAt = Date.now();
    let disposed = false;
    const renderCheckTimers: number[] = [];
    closedRef.current = false;
    seenSeqRef.current = 0;
    loggedPlainTextRef.current = "";
    emptyDisplayLogCountRef.current = 0;
    displayWriteLogCountRef.current = 0;
    renderCheckLogCountRef.current = 0;
    fitLogCountRef.current = 0;
    terminalTranscriptLogCountRef.current = 0;
    xtermRenderHealthyRef.current = false;
    terminalTranscriptRef.current = "";
    initialDisplayBufferRef.current = "";
    displayControlCarryRef.current.current = "";
    pendingRef.current = [];
    let hasLoadedReplay = false;
    let eventBuffer: TerminalOutputEventPayload[] = [];
    let unlisten: (() => void) | null = null;
    let startupNoticeIsVisible = Boolean(startupNotice);

    const terminalFont = getComputedStyle(document.documentElement).getPropertyValue("--terminal-font").trim() || "\"Sometype Mono\", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: terminalFont,
      fontSize: 13,
      lineHeight: 1.3,
      scrollback: terminalXtermScrollback,
      theme: xtermThemeFromCss(),
    });
    const fitAddon = new FitAddon();
    terminalRef.current = terminal;
    fitRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void openTerminalWebLink(uri);
    }));
    terminal.open(container);
    // Live preset switches update the root CSS vars; re-derive the xterm
    // theme so open terminals do not keep stale colors until remount.
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = xtermThemeFromCss();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    const isCurrentEffect = () => !disposed && xtermEffectRunRef.current === effectRun && !closedRef.current;
    appendImportLog(`Terminal xterm opened session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} active=${isActive} elapsedMs=${Date.now() - mountedAt}`);
    if (isActive) {
      terminal.focus();
    }
    setStartupNoticeVisible(startupNoticeIsVisible);

    const clearStartupNotice = () => {
      if (!startupNoticeIsVisible) return;
      startupNoticeIsVisible = false;
      setStartupNoticeVisible(false);
    };

    const logEmptyDisplay = (source: "output" | "replay", bytesLength: number, seq: number | null, text: string) => {
      if (emptyDisplayLogCountRef.current >= 5) return;
      emptyDisplayLogCountRef.current += 1;
      appendImportLog(`Terminal display empty session=${session.id} source=${source} bytes=${bytesLength} seq=${seq ?? "none"} count=${emptyDisplayLogCountRef.current} parsedTail=${JSON.stringify(terminalDisplayDebugTail(text))}`);
    };

    const setTerminalTranscript = (text: string, reason: string) => {
      if (!isCurrentEffect()) return;
      const nextText = text.trimEnd();
      if (nextText === terminalTranscriptRef.current) return;
      terminalTranscriptRef.current = nextText;
      if (terminalTranscriptLogCountRef.current < 8) {
        terminalTranscriptLogCountRef.current += 1;
        appendImportLog(`Terminal transcript cache updated session=${session.id} effect=${effectRun} reason=${reason} chars=${nextText.length} lines=${nextText.split("\n").length} elapsedMs=${Date.now() - mountedAt} count=${terminalTranscriptLogCountRef.current}`);
      }
    };

    const appendTerminalTranscript = (text: string, reason: string) => {
      const nextText = appendTerminalTranscriptText(terminalTranscriptRef.current, terminalTranscriptTextForDisplay(text));
      setTerminalTranscript(nextText, reason);
    };

    const logDisplayWrite = (source: "output" | "replay", bytesLength: number, seq: number | null, displayText: string, hasVisibleText: boolean) => {
      if (displayWriteLogCountRef.current >= 8) return;
      displayWriteLogCountRef.current += 1;
      appendImportLog(`Terminal display write session=${session.id} effect=${effectRun} source=${source} bytes=${bytesLength} seq=${seq ?? "none"} displayChars=${displayText.length} visible=${hasVisibleText} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} elapsedMs=${Date.now() - mountedAt} count=${displayWriteLogCountRef.current}`);
    };

    const checkXtermRender = (source: "output" | "replay", seq: number | null, finalCheck: boolean) => {
      if (!isCurrentEffect()) return;
      const snapshot = xtermRenderSnapshot(container, terminal);
      if (renderCheckLogCountRef.current < 12) {
        renderCheckLogCountRef.current += 1;
        appendImportLog(`Terminal xterm render check session=${session.id} effect=${effectRun} source=${source} seq=${seq ?? "none"} final=${finalCheck} ${xtermRenderSnapshotSummary(snapshot)} elapsedMs=${Date.now() - mountedAt} count=${renderCheckLogCountRef.current}`);
      }
      if (snapshot.rendered || snapshot.interactive) {
        xtermRenderHealthyRef.current = true;
        return;
      }
      if (finalCheck && terminalTranscriptRef.current.trim()) {
        appendImportLog(`Terminal xterm render unresolved session=${session.id} effect=${effectRun} keeping=xterm ${xtermRenderSnapshotSummary(snapshot)} transcriptChars=${terminalTranscriptRef.current.length} elapsedMs=${Date.now() - mountedAt}`);
      }
    };

    const scheduleXtermRenderChecks = (source: "output" | "replay", seq: number | null) => {
      if (xtermRenderHealthyRef.current) return;
      renderCheckTimers.push(window.setTimeout(() => checkXtermRender(source, seq, false), 120));
      renderCheckTimers.push(window.setTimeout(() => checkXtermRender(source, seq, true), 650));
    };

    const writeDisplayText = (source: "output" | "replay", bytesLength: number, seq: number | null, displayText: string, text: string) => {
      appendTerminalTranscript(text, `${source}-raw`);
      if (!displayText) {
        logEmptyDisplay(source, bytesLength, seq, text);
        return;
      }
      const hasVisibleText = terminalDisplayHasVisibleText(displayText);
      logDisplayWrite(source, bytesLength, seq, displayText, hasVisibleText);
      if (!hasVisibleText) logEmptyDisplay(source, bytesLength, seq, text);
      terminal.write(displayText, () => {
        if (!isCurrentEffect()) return;
        if (!hasVisibleText) return;
        clearStartupNotice();
        scheduleXtermRenderChecks(source, seq);
      });
    };

    const fit = () => {
      if (!isCurrentEffect()) return;
      if (container.clientWidth <= 0 || container.clientHeight <= 0) {
        if (fitLogCountRef.current < 8) {
          fitLogCountRef.current += 1;
          appendImportLog(`Terminal fit skipped session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} elapsedMs=${Date.now() - mountedAt} count=${fitLogCountRef.current}`);
        }
        return;
      }
      try {
        fitAddon.fit();
        void sendResize(session.id, terminal.cols, terminal.rows);
        if (fitLogCountRef.current < 8) {
          fitLogCountRef.current += 1;
          appendImportLog(`Terminal fit session=${session.id} effect=${effectRun} container=${container.clientWidth}x${container.clientHeight} cols=${terminal.cols} rows=${terminal.rows} elapsedMs=${Date.now() - mountedAt} count=${fitLogCountRef.current}`);
        }
      } catch {
        // xterm fit can throw while the panel is resizing; the next observer tick retries.
      }
    };

    const dataDisposable = terminal.onData((data) => {
      if (!isCurrentEffect()) return;
      queueTerminalInput(data);
    });
    const pasteListenerOptions: AddEventListenerOptions = { capture: true };
    const handlePaste = (event: ClipboardEvent) => {
      if (!isCurrentEffect()) return;
      const imageFiles = terminalClipboardImageFiles(event.clipboardData);
      if (!imageFiles.length) return;
      const pastedText = event.clipboardData?.getData("text/plain") || "";
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      appendImportLog(`Terminal image paste start session=${session.id} files=${imageFiles.length} textChars=${pastedText.length}`);
      void (async () => {
        try {
          const savedPaths = await saveTerminalDroppedFiles(activeProject, imageFiles);
          if (!isCurrentEffect()) return;
          for (const path of savedPaths) {
            queueTerminalInput(terminalBracketedPaste(path));
          }
          if (pastedText) {
            queueTerminalInput(terminalBracketedPaste(pastedText));
          }
          terminalRef.current?.focus();
          appendImportLog(`Terminal image paste complete session=${session.id} files=${savedPaths.length} textChars=${pastedText.length}`);
        } catch (error) {
          if (!isCurrentEffect()) return;
          const message = error instanceof Error ? error.message : String(error);
          appendImportLog(`Terminal image paste failed session=${session.id}`, error);
          terminal.write(`\r\n\x1b[31m[hyperwiki] image paste failed: ${message}\x1b[0m\r\n`);
        }
      })();
    };
    container.addEventListener("paste", handlePaste, pasteListenerOptions);
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (!isCurrentEffect()) return;
      void sendResize(session.id, cols, rows);
    });
    const observer = new ResizeObserver(fit);
    observer.observe(container);

    const writeTerminalChunk = (payload: TerminalOutputEventPayload) => {
      if (!isCurrentEffect()) return;
      if (payload.sessionId !== session.id || payload.seq <= seenSeqRef.current) return;
      const firstOutput = seenSeqRef.current === 0;
      seenSeqRef.current = payload.seq;
      const bytes = Uint8Array.from(payload.bytes || []);
      if (!bytes.length) return;
      const text = terminalBytesToText(bytes);
      const displayText = cleanInitialTerminalDisplayText(
        terminalDisplayTextForXterm(text, displayControlCarryRef.current),
        initialDisplayBufferRef
      );
      onTerminalText(session.id, terminalTextForParsing(text));
      logTerminalPlainText(session.id, "Terminal output plain", bytes.length, payload.seq, text, loggedPlainTextRef);
      if (firstOutput) appendImportLog(`Terminal first output session=${session.id} seq=${payload.seq} bytes=${bytes.length}`);
      writeDisplayText("output", bytes.length, payload.seq, displayText, text);
    };

    const handleTerminalChunk = (payload: TerminalOutputEventPayload) => {
      if (!isCurrentEffect()) return;
      if (payload.sessionId !== session.id) return;
      if (!hasLoadedReplay) {
        eventBuffer.push(payload);
        return;
      }
      writeTerminalChunk(payload);
    };

    async function attach() {
      try {
        unlisten = await listenTerminalOutput(handleTerminalChunk);
        const replay = await hyperwikiApi.json<TerminalReplayResponse>(`/api/terminal/${encodeURIComponent(session.id)}/replay`);
        if (!isCurrentEffect()) return;
        if (replay.bytes?.length) {
          const bytes = Uint8Array.from(replay.bytes);
          const text = terminalBytesToText(bytes);
          const displayText = cleanInitialTerminalDisplayText(
            terminalDisplayTextForXterm(text, displayControlCarryRef.current),
            initialDisplayBufferRef
          );
          onTerminalText(session.id, terminalTextForParsing(text));
          logTerminalPlainText(session.id, "Terminal replay plain", bytes.length, replay.seq, text, loggedPlainTextRef);
          appendImportLog(`Terminal first replay output session=${session.id} seq=${replay.seq} bytes=${bytes.length}`);
          writeDisplayText("replay", bytes.length, replay.seq, displayText, text);
        }
        seenSeqRef.current = replay.seq || 0;
        hasLoadedReplay = true;
        eventBuffer.sort((left, right) => left.seq - right.seq).forEach(writeTerminalChunk);
        eventBuffer = [];
        fit();
        void flushPendingInput();
      } catch (error) {
        if (!isCurrentEffect()) return;
        terminal.writeln("");
        terminal.writeln(error instanceof Error ? error.message : String(error));
      }
    }

    void attach();
    const fitTimer = window.setTimeout(fit, 0);

    return () => {
      disposed = true;
      closedRef.current = true;
      appendImportLog(`Terminal xterm cleanup session=${session.id} effect=${effectRun} elapsedMs=${Date.now() - mountedAt}`);
      if (unlisten) unlisten();
      renderCheckTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(fitTimer);
      observer.disconnect();
      themeObserver.disconnect();
      container.removeEventListener("paste", handlePaste, pasteListenerOptions);
      dataDisposable.dispose();
      resizeDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitRef.current = null;
    };
  }, [activeProject?.id, flushPendingInput, onTerminalText, queueTerminalInput, session.id]);

  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  return (
    <div className="relative h-full min-h-0">
      {startupNoticeVisible && startupNotice ? (
        <div className="pointer-events-none absolute left-3 top-2 z-10 font-mono text-[13px] text-terminal-muted">
          {startupNotice}
        </div>
      ) : null}
      <div
        className="terminal-scrollbar-thin h-full min-h-0 p-1"
        onClick={() => terminalRef.current?.focus()}
        onMouseDown={() => terminalRef.current?.focus()}
        ref={containerRef}
      />
    </div>
  );
}
