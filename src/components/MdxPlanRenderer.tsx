import { createElement, Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AppWindow,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleSlash2,
  Clipboard,
  Clock,
  Code2,
  CodeXml,
  FileText,
  FlagTriangleRight,
  Folder,
  Info,
  Lightbulb,
  MessageSquareText,
  MousePointerClick,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  X,
} from "lucide-react";
import {
  Accordion as UiAccordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs as UiTabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { UnitScreenshotImageData } from "@/lib/api";
import type { UnitExplorationMetadata } from "@/lib/types";
import { cn } from "@/lib/utils";
import { normalizePlanDisplayTitle } from "@/lib/wiki-title";

interface MdxPlanRendererProps {
  source: string;
  markdown?: string;
  status?: string;
  validationWarnings?: MdxValidationWarning[];
  onNavigate: (path: string) => void;
  canDeletePlan?: boolean;
  onDeletePlan?: () => Promise<void>;
  path?: string;
  pageStatuses?: Record<string, string>;
  onSendCommand?: (command: string) => void;
  onToggleTask?: (text: string, checked: boolean) => Promise<void> | void;
  onProposeChange?: (prompt: string) => void;
  unitScreenshots?: UnitScreenshotImageData[];
  onReviewScreenshots?: () => void;
  unitExplorations?: UnitScreenshotImageData[];
  unitExplorationMetadata?: UnitExplorationMetadata | null;
  onExploreDesigns?: () => void;
}

interface PlanRenderContext {
  path?: string;
  pageStatuses?: Record<string, string>;
  onSendCommand?: (command: string) => void;
  onToggleTask?: (text: string, checked: boolean) => Promise<void> | void;
  onProposeChange?: (prompt: string) => void;
}

// Render-scoped extras for deep helpers; refreshed on every MdxPlanRenderer
// render and read by event handlers at event time, so only one renderer
// instance may be mounted at once (true for the workspace pane).
let planRenderContext: PlanRenderContext = {};

interface MdxValidationWarning {
  kind: string;
  message: string;
  href?: string;
  line: number;
}

const componentTags = [
  "PlanHero",
  "PlanSummary",
  "PlanUnit",
  "Decision",
  "Evidence",
  "Verification",
  "Scope",
  "ImplementationNotes",
  "Dependencies",
  "CompletionGate",
  "Callout",
  "Note",
  "Tip",
  "Warning",
  "Danger",
  "Check",
  "Panel",
  "Frame",
  "Screen",
  "Mockup",
  "Card",
  "CardGroup",
  "Columns",
  "Column",
  "Aside",
  "FlowStep",
  "Flow",
  "StageTrack",
  "StageItem",
  "OpenDecision",
  "DecisionOption",
  "RequestExample",
  "ResponseExample",
  "Steps",
  "Step",
  "Prompt",
  "Update",
  "TaskList",
  "StatusBadge",
  "Badge",
  "ParamField",
  "ResponseField",
  "Tree",
  "TreeFolder",
  "TreeFile",
  "CodeBlock",
  "CommandBlock",
  "Visibility",
  "Tabs",
  "Tab",
  "AccordionGroup",
  "Accordion",
  "AccordionItem",
  "Tooltip",
];

const inlineCodeClassName =
  "rounded border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground";

export function MdxPlanRenderer({ source, markdown, status, validationWarnings = [], onNavigate, canDeletePlan = false, onDeletePlan, path, pageStatuses, onSendCommand, onToggleTask, onProposeChange, unitScreenshots = [], onReviewScreenshots, unitExplorations = [], unitExplorationMetadata = null, onExploreDesigns }: MdxPlanRendererProps) {
  planRenderContext = { path, pageStatuses, onSendCommand, onToggleTask, onProposeChange };
  const content = useMemo(() => renderTrustedMdx(source, onNavigate, path, status), [source, onNavigate, path, status, pageStatuses]);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const hasUnitScreenshots = unitScreenshots.length > 0;
  const hasUnitExplorations = unitExplorations.length > 0;
  const latestScreenshot = latestUnitImage(unitScreenshots);
  const latestExploration = latestUnitImage(unitExplorations);
  const latestVisualEvidence = latestScreenshot && (!latestExploration || latestScreenshot.capturedAt >= latestExploration.capturedAt)
    ? { kind: "screenshot" as const, image: latestScreenshot }
    : latestExploration
      ? { kind: "exploration" as const, image: latestExploration }
      : null;
  const latestVisualAction = latestVisualEvidence?.kind === "screenshot" ? onReviewScreenshots : onExploreDesigns;
  const deletePlan = async () => {
    if (!onDeletePlan || isDeletingPlan) return;
    setIsDeletingPlan(true);
    setDeleteStatus("Deleting plan");
    try {
      await onDeletePlan();
      setDeleteStatus("Plan deleted");
    } catch (error) {
      setDeleteStatus(error instanceof Error ? error.message : "Could not delete plan");
      setIsDeletingPlan(false);
    }
  };
  useEffect(() => {
    setIsDeleteConfirming(false);
    setIsDeletingPlan(false);
    setDeleteStatus("");
  }, [path]);
  if (!source.trim()) {
    return <div className="p-8 text-sm text-muted-foreground">No plan source loaded.</div>;
  }
  return (
    <article className="relative h-full overflow-auto bg-background text-foreground">
      <TooltipProvider>
        {canDeletePlan ? (
          <div className="pointer-events-none absolute right-3 top-5 z-10 flex items-start gap-1.5">
            {(
              isDeleteConfirming ? (
                <div className="pointer-events-auto ml-3 flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Are you sure?</span>
                  <Button
                    aria-label="Cancel plan deletion"
                    className="h-8 px-2.5 text-xs"
                    disabled={isDeletingPlan}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDeleteConfirming(false);
                      setDeleteStatus("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    aria-label="Delete plan"
                    className="h-8 px-2.5 text-xs"
                    disabled={isDeletingPlan}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={deletePlan}
                  >
                    {isDeletingPlan ? "Deleting..." : "Delete Plan"}
                  </Button>
                </div>
              ) : (
                <Button
                  aria-label="Delete plan"
                  className="pointer-events-auto size-8 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() => setIsDeleteConfirming(true)}
                >
                  <X aria-hidden="true" data-icon="inline-start" />
                </Button>
              )
            )}
            <span className="sr-only" aria-live="polite">{deleteStatus}</span>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-[68rem] flex-col gap-4 px-5 pt-5 pb-16 md:px-8 md:pb-24">
          {validationWarnings.length ? (
            <Alert className="rounded-lg">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Wiki validation warnings</AlertTitle>
              <AlertDescription>
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
                  {validationWarnings.slice(0, 5).map((warning, index) => (
                    <li key={`${warning.kind}-${warning.line}-${index}`}>
                      Line {warning.line}: {warning.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          {onExploreDesigns ? (
            <Card className="gap-0 overflow-hidden py-0" data-unit-visual-evidence="true">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-semibold">Design</span>
                  </div>
                  {hasUnitExplorations ? <Badge variant="outline">{unitExplorations.length} candidate{unitExplorations.length === 1 ? "" : "s"}</Badge> : null}
                  {unitExplorationMetadata?.selectedCandidate ? <Badge variant="secondary">Selected</Badge> : null}
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <Button className="flex-1 sm:flex-none" disabled={!hasUnitScreenshots} size="sm" type="button" variant="outline" onClick={() => onReviewScreenshots?.()}>
                    <Camera aria-hidden="true" data-icon="inline-start" />
                    Review Screenshots
                  </Button>
                  <Button className="flex-1 sm:flex-none" size="sm" type="button" variant="outline" onClick={onExploreDesigns}>
                    <Sparkles aria-hidden="true" data-icon="inline-start" />
                    Explore Design
                  </Button>
                </div>
              </div>
              <section className="flex min-h-[14rem] min-w-0 flex-col gap-3 p-3" data-unit-visual-preview="true">
                {latestVisualEvidence ? (
                  <button
                    aria-label={latestVisualEvidence.kind === "screenshot" ? "Open screenshot review" : "Open design review"}
                    className="group block flex-1 overflow-hidden rounded-md border bg-muted/35"
                    type="button"
                    onClick={() => latestVisualAction?.()}
                  >
                    <img
                      alt={latestVisualEvidence.kind === "screenshot" ? "Latest screenshot for the unit" : "Latest design candidate for the unit"}
                      className="block max-h-[24rem] min-h-[12rem] w-full cursor-pointer bg-muted object-contain transition-opacity group-hover:opacity-95"
                      src={latestVisualEvidence.image.dataUrl}
                    />
                  </button>
                ) : (
                  <div className="flex flex-1 flex-col justify-center gap-1 rounded-md border bg-muted/20 px-3 py-8 text-sm">
                    <span className="font-medium text-foreground">No visual evidence yet</span>
                    <span className="text-muted-foreground">Run Execute Unit to capture implementation evidence, or explore a design first.</span>
                  </div>
                )}
              </section>
            </Card>
          ) : null}
          {content}
          {markdown ? <span className="sr-only" data-markdown-derivative={markdown.length}>Markdown derivative available</span> : null}
        </div>
      </TooltipProvider>
    </article>
  );
}

function latestUnitImage(images: UnitScreenshotImageData[]) {
  return images.reduce<UnitScreenshotImageData | null>((latest, image) => (
    !latest || image.capturedAt > latest.capturedAt ? image : latest
  ), null);
}

function renderTrustedMdx(source: string, onNavigate: (path: string) => void, path?: string, pageStatus?: string) {
  if (typeof DOMParser === "undefined") return null;
  const html = mdxBodyToHtml(source);
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  return Array.from(document.body.firstElementChild?.childNodes || []).map((node, index) => renderNode(node, `${index}`, onNavigate, path, pageStatus));
}

function mdxBodyToHtml(source: string) {
  const body = expandEscapedSourceContextParagraphs(normalizeComponentTags(stripFrontmatter(source).replaceAll("className=", "class=")));
  const lines = body.split(/\r?\n/);
  const html: string[] = [];
  let inCode = false;
  let code = "";
  let inList = false;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
        code = "";
        inCode = false;
      } else {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code += `${line}\n`;
      continue;
    }
    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith("<")) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(line);
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const item = trimmed.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(item[1])}</li>`);
      continue;
    }
    const table = parseTableBlock(lines, lineIndex);
    if (table) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(table.html);
      lineIndex = table.nextIndex - 1;
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
}

function expandEscapedSourceContextParagraphs(source: string) {
  return source.replace(/<p>(## \/wiki\/[\s\S]*?)<\/p>/g, (_match, inner: string) => {
    const rendered = renderCollapsedSourceContext(decodeCommonHtmlEntities(inner));
    return rendered || _match;
  });
}

function renderCollapsedSourceContext(value: string) {
  return normalizedSourceSegments(value)
    .map((segment) => {
      const parsed = collapsedSourcePathAndBody(segment);
      if (!parsed) return "";
      const body = stripCollapsedFrontmatter(parsed.body).trim();
      if (!body) return "";
      return `<article class="source-decision"><h3><a href="${escapeHtml(parsed.path)}">${escapeHtml(parsed.path)}</a></h3>${body}</article>`;
    })
    .filter(Boolean)
    .join("\n");
}

function normalizedSourceSegments(value: string) {
  return value
    .replaceAll(" ## /wiki/", "\n## /wiki/")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## /wiki/"));
}

function collapsedSourcePathAndBody(segment: string) {
  const rest = segment.replace(/^##\s+/, "");
  const split = rest.search(/\s/);
  if (split === -1) return null;
  return { path: rest.slice(0, split), body: rest.slice(split) };
}

function stripCollapsedFrontmatter(value: string) {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("--- ")) return trimmed;
  const end = trimmed.indexOf(" --- ", 4);
  return end === -1 ? trimmed : trimmed.slice(end + " --- ".length);
}

function parseTableBlock(lines: string[], startIndex: number) {
  const headerLine = lines[startIndex];
  const separatorLine = lines[startIndex + 1];
  if (!isTableRowLine(headerLine) || !isTableSeparatorLine(separatorLine)) return null;

  const headers = splitTableRow(headerLine);
  const rows: string[][] = [];
  let nextIndex = startIndex + 2;
  while (nextIndex < lines.length && isTableRowLine(lines[nextIndex])) {
    rows.push(splitTableRow(lines[nextIndex]));
    nextIndex += 1;
  }

  const head = headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${inlineMarkdown(row[index] || "")}</td>`).join("")}</tr>`)
    .join("");

  return {
    html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`,
    nextIndex,
  };
}

function isTableRowLine(line: string | undefined) {
  if (!line) return false;
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function isTableSeparatorLine(line: string | undefined) {
  if (!isTableRowLine(line)) return false;
  if (!line) return false;
  return splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function stripFrontmatter(source: string) {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? source : source.slice(end + "\n---".length);
}

function normalizeComponentTags(source: string) {
  return componentTags.reduce((current, tag) => {
    // Self-closing component tags must become explicit open+close pairs;
    // the HTML parser treats `<section ... />` as an unclosed open tag and
    // would swallow the rest of the document into it.
    const selfClosing = new RegExp(`<${tag}((?:\\s[^>]*?)?)/>`, "g");
    const open = new RegExp(`<${tag}(\\s|>)`, "g");
    const close = new RegExp(`</${tag}>`, "g");
    return current
      .replace(selfClosing, `<section data-plan-component="${tag}"$1></section>`)
      .replace(open, `<section data-plan-component="${tag}"$1`)
      .replace(close, "</section>");
  }, source);
}

function renderNode(node: ChildNode, key: string, onNavigate: (path: string) => void, path?: string, pageStatus?: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
  if (tag === "svg") return renderSvgElement(node, key, true);
  if (svgChildTags.has(tag)) return null;
  const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate, path, pageStatus));
  const titleChildren = normalizeTitleChildren(children);
  const className = node.getAttribute("class") || "";
  const component = node.getAttribute("data-plan-component") || "";
  const classTokens = new Set(className.split(/\s+/).filter(Boolean));

  if (component) {
    const renderedComponent = renderPlanComponent(node, component, children, key, onNavigate, path, pageStatus);
    if (renderedComponent !== undefined) return renderedComponent;
  }

  if (component === "CommandBlock") {
    return <pre className="overflow-auto rounded-md border bg-muted px-4 py-3 font-mono text-xs leading-6 text-foreground" key={key}>{children}</pre>;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    const wikiPath = resolveWikiLink(href, path);
    return (
      <a
        className="font-semibold text-primary underline-offset-4 hover:underline"
        href={href}
        key={key}
        onClick={(event) => {
          if (!wikiPath) return;
          event.preventDefault();
          onNavigate(wikiPath);
        }}
      >
        {titleChildren}
      </a>
    );
  }
  if (tag === "h1") return <h1 className="m-0 max-w-4xl text-xl font-bold leading-tight md:text-2xl" key={key}>{titleChildren}</h1>;
  if (tag === "h2") return <h2 className="m-0 text-base font-bold leading-tight" key={key}>{titleChildren}</h2>;
  if (tag === "h3") return <h3 className="m-0 text-sm font-bold leading-snug" key={key}>{titleChildren}</h3>;
  if (tag === "p") return <p className="m-0 max-w-3xl text-sm leading-6 text-muted-foreground" key={key}>{children}</p>;
  if (tag === "strong") return <strong className="font-bold text-foreground" key={key}>{children}</strong>;
  if (tag === "em") return <em className="italic" key={key}>{children}</em>;
  if (tag === "code") {
    const isPreformatted = node.parentElement?.tagName.toLowerCase() === "pre";
    return <code className={isPreformatted ? "font-mono text-foreground" : inlineCodeClassName} key={key}>{children}</code>;
  }
  if (tag === "pre") return <pre className="overflow-auto rounded-md border bg-muted px-3 py-2.5 font-mono text-xs leading-5 text-foreground" key={key}>{children}</pre>;
  if (tag === "table") return <div className="overflow-x-auto rounded-md border" key={key}><table className="w-full border-collapse text-sm">{children}</table></div>;
  if (tag === "thead") return <thead className="bg-secondary/70 text-foreground" key={key}>{children}</thead>;
  if (tag === "tbody") return <tbody className="divide-y" key={key}>{children}</tbody>;
  if (tag === "tr") return <tr key={key}>{children}</tr>;
  if (tag === "th") return <th className="px-3 py-2 text-left font-bold leading-6" key={key}>{children}</th>;
  if (tag === "td") return <td className="px-3 py-2 align-top leading-6 text-muted-foreground" key={key}>{children}</td>;
  if (tag === "ul") return <ul className="m-0 flex list-disc flex-col gap-1 pb-2 pl-5 text-sm font-normal leading-6 text-muted-foreground marker:text-muted-foreground/65" key={key}>{children}</ul>;
  if (tag === "ol") return <ol className="m-0 flex list-decimal flex-col gap-1 pb-2 pl-5 text-sm font-normal leading-6 text-muted-foreground marker:text-muted-foreground/65" key={key}>{children}</ol>;
  if (tag === "li") return <li className="pl-1 font-normal" key={key}>{children}</li>;
  if (tag === "dl") return <dl className={cn("grid gap-2", classTokens.has("summary") && "grid-cols-[auto_minmax(0,1fr)] rounded-md border bg-secondary/50 p-4 text-sm")} key={key}>{children}</dl>;
  if (tag === "dt") return <dt className="font-bold text-muted-foreground" key={key}>{children}</dt>;
  if (tag === "dd") return <dd className="m-0 min-w-0 font-semibold" key={key}>{children}</dd>;
  const isHero = component === "PlanHero" || classTokens.has("hero") || classTokens.has("import-hero");
  const isSummary = component === "PlanSummary" || classTokens.has("summary") || classTokens.has("status-grid");
  const isStage = classTokens.has("stage");
  const isUnit = component === "PlanUnit" || classTokens.has("unit");
  const isPanel = classTokens.has("panel") || classTokens.has("decision-panel") || component === "Decision" || component === "Evidence" || component === "Callout";

  if (isHero) return <section className="grid gap-3 pb-5" key={key}>{children}</section>;
  if (isSummary) return <section className="grid gap-2 rounded-md border bg-secondary/50 p-3" key={key}>{children}</section>;
  if (isStage) return <section className="grid gap-5 border-t pt-8" key={key}>{children}</section>;
  if (isUnit) return <article className="grid gap-3 py-1" key={key}>{children}</article>;
  if (isPanel) return <section className="grid gap-3 py-1" key={key}>{children}</section>;
  if (tag === "section") return <section className="grid gap-3" key={key}>{children}</section>;
  if (tag === "article") return <article className="grid gap-3" key={key}>{children}</article>;
  if (tag === "div") return <div className="grid gap-3" key={key}>{children}</div>;

  return <span key={key}>{children}</span>;
}

function renderPlanComponent(
  node: Element,
  component: string,
  children: ReactNode[],
  key: string,
  onNavigate: (path: string) => void,
  path?: string,
  pageStatus?: string,
): ReactNode | undefined {
  const title = componentTitle(node);
  const description = node.getAttribute("description") || node.getAttribute("summary") || "";
  const icon = node.getAttribute("icon") || "";

  if (component === "Visibility") {
    const audience = node.getAttribute("for") || node.getAttribute("audience") || "";
    return audience.toLowerCase() === "agents" ? null : <>{children}</>;
  }

  if (component === "PlanHero") {
    return (
      <section className="grid gap-3 pb-5 pr-28" key={key}>
        {renderComponentHeader(title, description, pageStatus || node.getAttribute("status"))}
        {children}
      </section>
    );
  }

  if (component === "PlanSummary") {
    return (
      <section className="bg-secondary/25 px-0 py-2" key={key}>
        {renderSummaryGrid(node, key, onNavigate, path) || <div className="grid gap-2 px-1">{children}</div>}
      </section>
    );
  }

  if (component === "PlanUnit" || component === "Panel") {
    return (
      <section className="grid gap-2 py-1" key={key}>
        {title ? <h2 className="m-0 text-base font-bold leading-tight">{title}</h2> : null}
        {description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        <div className="grid gap-2">{children}</div>
      </section>
    );
  }

  if (component === "Card") {
    const cardStatus = node.getAttribute("status") || node.getAttribute("severity") || "";
    return (
      <Card className={cn("rounded-md py-3 shadow-none", cardStatus && cn("border-l-2", cardStatusBorderClass(cardStatus)))} key={key}>
        {title || description || cardStatus ? (
          <CardHeader className="px-3">
            {cardStatus ? <Badge className="w-fit" variant={statusBadgeVariant(cardStatus)}>{cardStatus}</Badge> : null}
            {title ? <CardTitle className="text-sm leading-tight">{title}</CardTitle> : null}
            {description ? <CardDescription className="text-xs leading-5">{description}</CardDescription> : null}
          </CardHeader>
        ) : null}
        <CardContent className="grid gap-2 px-3">{children}</CardContent>
      </Card>
    );
  }

  if (component === "CardGroup") {
    return <div className={cardGroupClass(node)} key={key}>{children}</div>;
  }

  if (component === "Columns") {
    return <div className={columnsClass(node)} key={key}>{children}</div>;
  }

  if (component === "Column") {
    return <div className="grid min-w-0 gap-3" key={key}>{children}</div>;
  }

  if (component === "Aside") {
    return (
      <aside className="grid gap-2 rounded-md border bg-secondary/25 p-3 text-sm" key={key}>
        {title ? <h3 className="m-0 text-sm font-bold leading-snug">{title}</h3> : null}
        {description ? <p className="m-0 leading-6 text-muted-foreground">{description}</p> : null}
        <div className="grid gap-2">{children}</div>
      </aside>
    );
  }

  if (component === "Flow") {
    return renderFlow(node, key);
  }

  if (component === "FlowStep") {
    return flowStepChip(node, key);
  }

  if (component === "StageTrack") {
    return renderStageTrack(node, key, onNavigate, path);
  }

  if (component === "StageItem") {
    return <ol className="m-0 grid list-none gap-0 border-l border-border/80 p-0 pl-4" key={key}>{renderStageItem(node, `${key}-item`, onNavigate, path)}</ol>;
  }

  if (component === "OpenDecision") {
    return renderOpenDecision(node, key, onNavigate, path);
  }

  if (component === "DecisionOption") {
    return renderDecisionOption(node, "", `${key}-option`);
  }

  if (component === "RequestExample" || component === "ResponseExample") {
    return renderExamplePanel(node, component, children, key);
  }

  if (component === "Decision" || component === "Evidence") {
    return (
      <section className="grid gap-2 py-1" key={key}>
        {title ? <h2 className="m-0 text-base font-bold leading-tight">{title}</h2> : null}
        {description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        <div className="grid gap-2">{children}</div>
      </section>
    );
  }

  if (planSectionDefaults[component]) {
    const heading = title || planSectionDefaults[component];
    // Only Completion Gate is a card; the rest render inline with a header + divider.
    const sectionBase = "grid gap-3 py-1.5";
    const descriptionNode = description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null;
    const fallbackBody = <div className="grid gap-2">{children}</div>;

    if (component === "Scope") {
      return (
        <section className={sectionBase} key={key}>
          {planSectionHeader(component, heading)}
          {descriptionNode}
          {renderScopeItems(node, key, onNavigate, path) ?? fallbackBody}
        </section>
      );
    }
    if (component === "ImplementationNotes") {
      return (
        <section className={sectionBase} key={key}>
          {planSectionHeader(component, heading)}
          {descriptionNode}
          {renderNumberedItems(node, key, onNavigate, path) ?? fallbackBody}
        </section>
      );
    }
    if (component === "Verification") {
      return (
        <section className={sectionBase} key={key}>
          {planSectionHeader(component, heading)}
          {descriptionNode}
          {renderVerificationChecks(node, key, onNavigate, path) ?? fallbackBody}
        </section>
      );
    }
    if (component === "Dependencies") {
      const noBlockers = /\bno blockers\b|blockers?:?\s*none/i.test(node.textContent || "");
      const pill = noBlockers ? (
        <span className="ml-auto inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Check className="size-3" aria-hidden="true" />
          No blockers
        </span>
      ) : null;
      return (
        <section className={sectionBase} key={key}>
          {planSectionHeader(component, heading, pill)}
          {descriptionNode}
          <div className="grid gap-2 text-sm leading-6 text-muted-foreground">{children}</div>
        </section>
      );
    }
    // CompletionGate: the only carded section — an accent-tinted criterion callout.
    return (
      <section className="grid gap-3 rounded-lg border border-primary/30 bg-primary/[0.06] p-4" key={key}>
        {planSectionHeader(component, heading)}
        {descriptionNode}
        <div className="grid gap-2 text-sm leading-6 text-foreground">{children}</div>
      </section>
    );
  }

  if (isCalloutComponent(component)) {
    return renderCallout(component, title, description, children, key, icon);
  }

  if (component === "Frame") {
    return (
      <div className="overflow-hidden rounded-md border bg-card shadow-sm" key={key}>
        {title ? (
          <div className="flex items-center justify-between gap-3 border-b bg-secondary/50 px-4 py-2">
            <div className="text-sm font-semibold">{title}</div>
            {node.getAttribute("caption") ? <div className="text-xs text-muted-foreground">{node.getAttribute("caption")}</div> : null}
          </div>
        ) : null}
        <div className="grid gap-3 p-4">{children}</div>
      </div>
    );
  }

  // Screen: a screen/step spec for a UI unit. The header carries optional route,
  // step, and progress chrome; the body is free MDX (purpose, canonical copy,
  // top-to-bottom layout, states, backing action). The copy stays in the source,
  // so an agent reading raw MDX gets the same decisions the rendered card shows.
  if (component === "Screen") {
    const route = node.getAttribute("route") || "";
    const step = node.getAttribute("step") || node.getAttribute("badge") || "";
    const progressRaw = node.getAttribute("progress") || "";
    const progressMatch = progressRaw.match(/\d+(?:\.\d+)?/);
    const progressValue = progressMatch ? Math.max(0, Math.min(100, Number(progressMatch[0]))) : null;
    return (
      <section className="grid gap-3 rounded-lg border bg-card p-4" key={key}>
        <div className="grid gap-2 border-b border-border/60 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <AppWindow aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <h3 className="m-0 text-sm font-bold leading-tight text-foreground">{title || "Screen"}</h3>
            {route ? <code className={cn(inlineCodeClassName, "text-[11px]")}>{route}</code> : null}
            {step ? <span className="ml-auto text-[11px] font-medium text-muted-foreground">{step}</span> : null}
          </div>
          {progressValue !== null ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progressValue}%` }} />
              </div>
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{progressRaw}</span>
            </div>
          ) : null}
        </div>
        {description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        <div className="grid gap-2.5">{children}</div>
      </section>
    );
  }

  // Mockup: a text/ASCII wireframe shown in a faux window frame. The wireframe is
  // plain monospace text in the source (typically a fenced block), so it reads
  // identically in a terminal and renders as a framed preview in-app.
  if (component === "Mockup") {
    return (
      <figure className="m-0 overflow-hidden rounded-md border bg-muted/30" key={key}>
        <div className="flex items-center gap-1.5 border-b bg-secondary/50 px-3 py-1.5">
          <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/30" />
          <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/30" />
          <span aria-hidden="true" className="size-2 rounded-full bg-muted-foreground/30" />
          {title ? <figcaption className="ml-2 text-[11px] font-medium text-muted-foreground">{title}</figcaption> : null}
        </div>
        <div className="overflow-x-auto px-4 py-3 font-mono text-xs leading-5 text-foreground [&_pre]:m-0 [&_pre]:overflow-visible [&_pre]:border-0 [&_pre]:bg-transparent [&_pre]:p-0">{children}</div>
      </figure>
    );
  }

  if (component === "Steps") {
    return <ol className="m-0 grid list-none gap-0 border-l border-border/80 p-0 pl-4" key={key}>{children}</ol>;
  }

  if (component === "Step") {
    const number = node.getAttribute("number") || node.getAttribute("index") || "";
    return (
      <li className="relative grid gap-1 pb-4 pl-3" key={key}>
        <div className="absolute -left-[1.36rem] top-1 flex size-3 items-center justify-center rounded-full border border-background bg-primary">
          {number ? <span className="sr-only">{number}</span> : null}
        </div>
        <div className="grid gap-1.5">
          {title ? <h3 className="m-0 text-sm font-bold leading-snug">{title}</h3> : null}
          {children}
        </div>
      </li>
    );
  }

  if (component === "Prompt") {
    return (
      <Collapsible defaultOpen className="rounded-lg border bg-card" key={key}>
        <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold">
          <span className="inline-flex items-center gap-2">
            <MessageSquareText className="size-4 text-muted-foreground" />
            {title || "Prompt"}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-3 border-t px-4 py-3">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  if (component === "Update") {
    return (
      <section className="grid gap-3 border-l-2 border-primary pl-4" key={key}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{node.getAttribute("label") || node.getAttribute("date") || "Update"}</Badge>
          {title ? <h3 className="m-0 text-base font-bold">{title}</h3> : null}
        </div>
        {children}
      </section>
    );
  }

  if (component === "TaskList") {
    return (
      <Card className="rounded-md py-3 shadow-none" key={key}>
        <CardHeader className="px-3">
          <CardTitle className="inline-flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 text-muted-foreground" />
            {title || "Tasks"}
          </CardTitle>
          {description ? <CardDescription className="text-xs leading-5">{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-2 px-3">{renderTaskItems(node, key, onNavigate, path) || children}</CardContent>
      </Card>
    );
  }

  if (component === "StatusBadge" || component === "Badge") {
    const value = node.getAttribute("status") || node.getAttribute("label") || node.textContent?.trim() || "Status";
    return <Badge className="w-fit" variant={statusBadgeVariant(value)} key={key}>{value}</Badge>;
  }

  if (component === "ParamField" || component === "ResponseField") {
    return renderFieldComponent(node, component, children, key);
  }

  if (component === "Tree") {
    return (
      <Card className="rounded-md py-3 shadow-none" key={key}>
        {title || description ? (
          <CardHeader className="px-3">
            {title ? <CardTitle className="text-sm">{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
        ) : null}
        <CardContent className="px-3">
          <div className="grid gap-1 rounded-md border bg-secondary/40 p-3 font-mono text-xs">{children}</div>
        </CardContent>
      </Card>
    );
  }

  if (component === "TreeFolder" || component === "TreeFile") {
    const name = node.getAttribute("name") || node.textContent?.trim() || (component === "TreeFolder" ? "folder" : "file");
    const depth = Number.parseInt(node.getAttribute("depth") || "0", 10);
    return (
      <div className="grid gap-1" key={key} style={{ paddingLeft: `${Number.isFinite(depth) ? depth * 14 : 0}px` }}>
        <div className="flex items-center gap-2 text-foreground">
          {component === "TreeFolder" ? <Folder className="size-3.5 text-muted-foreground" /> : <FileText className="size-3.5 text-muted-foreground" />}
          <span>{name}</span>
        </div>
        {component === "TreeFolder" && children.length ? <div className="grid gap-1 pl-4">{children}</div> : null}
      </div>
    );
  }

  if (component === "CodeBlock" || component === "CommandBlock") {
    return renderCodeBlock(node, children, key, component);
  }

  if (component === "Tabs") {
    return renderTabs(node, key, onNavigate, path);
  }

  if (component === "Tab") {
    return <div className="grid gap-3" key={key}>{children}</div>;
  }

  if (component === "AccordionGroup") {
    return renderAccordionGroup(node, key, onNavigate, path);
  }

  if (component === "Accordion" || component === "AccordionItem") {
    return renderAccordionItem(node, key, onNavigate, path);
  }

  if (component === "Tooltip") {
    const content = node.getAttribute("content") || node.getAttribute("tip") || node.getAttribute("title") || "";
    return (
      <Tooltip key={key}>
        <TooltipTrigger asChild>
          <span className="cursor-help underline decoration-dotted underline-offset-4">{children}</span>
        </TooltipTrigger>
        <TooltipContent>{content}</TooltipContent>
      </Tooltip>
    );
  }

  return undefined;
}

function renderSummaryGrid(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = Array.from(node.querySelectorAll(":scope > ul > li, :scope > ol > li"));
  if (!items.length) return null;
  return (
    <dl className="grid gap-1" key={`${key}-summary`}>
      {items.map((item, index) => {
        const label = summaryItemLabel(item);
        return (
          <div className="grid min-h-10 grid-cols-[8rem_minmax(0,1fr)] items-start gap-3 px-3 py-1.5 text-sm" key={`${key}-summary-${index}`}>
            <dt className="font-mono text-xs leading-6 text-muted-foreground">{label || "Detail"}</dt>
            <dd className="m-0 min-w-0 leading-6 text-foreground">{summaryItemValue(item, label, `${key}-summary-${index}`, onNavigate, path)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function summaryItemLabel(item: Element) {
  const text = item.textContent || "";
  const split = text.indexOf(":");
  return split === -1 ? "" : text.slice(0, split).trim();
}

function summaryItemValue(item: Element, label: string, key: string, onNavigate: (path: string) => void, path?: string) {
  if (!label) {
    return Array.from(item.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate, path));
  }
  let trimmedPrefix = false;
  return Array.from(item.childNodes)
    .map((child, index) => {
      if (!trimmedPrefix && child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || "";
        const split = text.indexOf(":");
        if (split !== -1) {
          trimmedPrefix = true;
          return text.slice(split + 1).trimStart();
        }
      }
      return renderNode(child, `${key}-${index}`, onNavigate, path);
    })
    .filter((child) => child !== "");
}

function renderComponentHeader(title: string, description: string, status: string | null) {
  if (!title && !description && !status) return null;
  return (
    <div className="grid gap-2">
      {status ? <Badge className="w-fit" variant={statusBadgeVariant(status)}>{status}</Badge> : null}
      {title ? <h1 className="m-0 max-w-4xl text-xl font-bold leading-tight md:text-2xl">{title}</h1> : null}
      {description ? <p className="m-0 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function renderCallout(component: string, title: string, description: string, children: ReactNode[], key: string, icon: string) {
  const kind = calloutKind(component);
  const destructive = kind === "danger";
  const iconNode = calloutIcon(kind, icon);
  return (
    <Alert className="rounded-lg" variant={destructive ? "destructive" : "default"} key={key}>
      {iconNode}
      <AlertTitle>{title || calloutTitle(kind)}</AlertTitle>
      <AlertDescription>
        {description ? <p className="m-0">{description}</p> : null}
        {children}
      </AlertDescription>
    </Alert>
  );
}

function renderFieldComponent(node: Element, component: string, children: ReactNode[], key: string) {
  const name = node.getAttribute("name") || node.getAttribute("field") || node.getAttribute("title") || "field";
  const type = node.getAttribute("type") || "";
  const required = booleanAttr(node, "required");
  const deprecated = booleanAttr(node, "deprecated");
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-4" key={key}>
      <div className="flex flex-wrap items-center gap-2">
        <code className={cn(inlineCodeClassName, "text-sm")}>{name}</code>
        {type ? <Badge variant="secondary">{type}</Badge> : null}
        {required ? <Badge>required</Badge> : null}
        {deprecated ? <Badge variant="destructive">deprecated</Badge> : null}
        <Badge variant="outline">{component === "ParamField" ? "param" : "response"}</Badge>
      </div>
      {children}
    </div>
  );
}

function renderExamplePanel(node: Element, component: string, children: ReactNode[], key: string) {
  const title = componentTitle(node) || (component === "RequestExample" ? "Request" : "Response");
  const description = node.getAttribute("description") || "";
  return (
    <section className="overflow-hidden rounded-md border bg-card" key={key}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-secondary/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Code2 aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </div>
        <Badge variant="outline">{component === "RequestExample" ? "request" : "response"}</Badge>
      </div>
      <div className="grid gap-2 p-3">
        {description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}

function renderCodeBlock(node: Element, children: ReactNode[], key: string, component = "CodeBlock") {
  const code = (node.textContent || "").trim();
  const title = componentTitle(node);
  const language = node.getAttribute("language") || node.getAttribute("lang") || "";
  const canSendToTerminal = component === "CommandBlock" && Boolean(code) && Boolean(planRenderContext.onSendCommand);
  return (
    <div className="overflow-hidden rounded-md border bg-card" key={key}>
      <div className="flex items-center justify-between gap-3 border-b bg-secondary/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Code2 className="size-3.5 shrink-0" />
          <span className="truncate">{title || language || "Code"}</span>
        </div>
        <div className="flex items-center gap-1">
          {canSendToTerminal ? (
            <Button
              className="h-7 gap-1.5 px-2 text-xs"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => planRenderContext.onSendCommand?.(code)}
            >
              <Play className="size-3.5" />
              Send to terminal
            </Button>
          ) : null}
          {code ? (
            <Button
              className="h-7 px-2"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(code)}
            >
              <Clipboard className="size-3.5" />
              <span className="sr-only">Copy code</span>
            </Button>
          ) : null}
        </div>
      </div>
      <ScrollArea className="max-h-[28rem]">
        <pre className="m-0 p-3 font-mono text-xs leading-5">
          {language.toLowerCase() === "diff" ? renderDiffLines(code) : children}
        </pre>
      </ScrollArea>
    </div>
  );
}

function renderDiffLines(code: string) {
  return code.split("\n").map((line, index) => {
    if (line.startsWith("#")) {
      return (
        <div className="my-0.5 border-l-2 border-primary/60 bg-secondary/40 py-0.5 pl-2 font-sans italic text-muted-foreground" key={index}>
          {line.replace(/^#\s?/, "")}
        </div>
      );
    }
    const style = line.startsWith("+")
      ? { color: "var(--diff-add, #15803d)" }
      : line.startsWith("-")
        ? { color: "var(--diff-remove, #b91c1c)" }
        : undefined;
    return (
      <div key={index} style={style}>
        {line || " "}
      </div>
    );
  });
}

function renderFlow(node: Element, key: string) {
  const steps = directComponentChildren(node, "FlowStep");
  const title = componentTitle(node);
  const vertical = (node.getAttribute("direction") || "").toLowerCase() === "vertical";
  if (!steps.length) return null;
  return (
    <section className="grid gap-2" key={key}>
      {title ? <h3 className="m-0 text-sm font-bold leading-snug">{title}</h3> : null}
      <div className={vertical ? "flex flex-col items-start gap-1" : "flex flex-wrap items-center gap-1.5"}>
        {steps.map((step, index) => (
          <Fragment key={`${key}-flow-${index}`}>
            {index ? (
              vertical
                ? <ChevronDown aria-hidden="true" className="ml-3 size-3.5 shrink-0 text-muted-foreground/70" />
                : <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/70" />
            ) : null}
            {flowStepChip(step, `${key}-flow-${index}-chip`)}
          </Fragment>
        ))}
      </div>
    </section>
  );
}

function flowStepChip(step: Element, key: string) {
  const label = step.getAttribute("label") || step.textContent?.trim() || "Step";
  const detail = step.getAttribute("detail") || "";
  const status = (step.getAttribute("status") || "").toLowerCase();
  return (
    <div
      className={cn(
        "grid gap-0.5 rounded-md border bg-card px-2.5 py-1.5",
        status === "done" && "bg-secondary/50",
        (status === "current" || status === "active") && "border-primary",
        (status === "blocked" || status === "danger") && "border-destructive",
      )}
      key={key}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-foreground">
        {status === "done" ? <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" /> : null}
        <span>{label}</span>
      </div>
      {detail ? <div className="font-mono text-[11px] leading-4 text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

function renderStageTrack(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = directComponentChildren(node, "StageItem");
  const title = componentTitle(node);
  if (!items.length) return null;
  return (
    <section className="grid gap-2" key={key}>
      {title ? <h3 className="m-0 text-sm font-bold leading-snug">{title}</h3> : null}
      <ol className="m-0 grid list-none gap-0 border-l border-border/80 p-0 pl-4 pt-1">
        {items.map((item, index) => renderStageItem(item, `${key}-stage-${index}`, onNavigate, path))}
      </ol>
    </section>
  );
}

function renderStageItem(item: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const label = item.getAttribute("label") || item.textContent?.trim() || "Stage";
  const detail = item.getAttribute("detail") || "";
  const href = item.getAttribute("href") || "";
  const wikiPath = href ? resolveWikiLink(href, path) : null;
  // The linked page's actual status wins over the hand-written attribute so
  // stage tracks stay truthful as units complete.
  const derivedStatus = wikiPath ? planRenderContext.pageStatuses?.[wikiPath] : undefined;
  const status = derivedStatus || item.getAttribute("status") || "";
  const normalizedStatus = status.toLowerCase();
  return (
    <li className="relative grid gap-0.5 pb-4 pl-3 last:pb-1" key={key}>
      <div
        className={cn(
          "absolute -left-[1.36rem] top-1.5 size-3 rounded-full border",
          normalizedStatus.includes("done") || normalizedStatus.includes("complete")
            ? "border-primary bg-primary"
            : normalizedStatus.includes("current") || normalizedStatus.includes("active")
              ? "border-primary bg-background ring-2 ring-primary/30"
              : normalizedStatus.includes("blocked")
                ? "border-destructive bg-destructive/80"
                : "border-border bg-background",
        )}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm leading-6">
        {href ? (
          <a
            className="font-semibold text-primary underline-offset-4 hover:underline"
            href={href}
            onClick={(event) => {
              if (!wikiPath) return;
              event.preventDefault();
              onNavigate(wikiPath);
            }}
          >
            {label}
          </a>
        ) : (
          <span className="font-semibold text-foreground">{label}</span>
        )}
        {status ? <Badge variant={statusBadgeVariant(status)}>{status}</Badge> : null}
      </div>
      {detail ? <div className="text-xs leading-5 text-muted-foreground">{detail}</div> : null}
    </li>
  );
}

function renderTaskItems(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = Array.from(node.querySelectorAll(":scope > ul > li, :scope > ol > li"));
  if (!items.length) return null;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0 text-sm leading-6">
      {items.map((item, index) => {
        const text = (item.textContent || "").trim();
        const match = text.match(/^\[( |x|X)\]\s*(.*)$/);
        if (!match) {
          return <li className="pl-6" key={`${key}-task-${index}`}>{Array.from(item.childNodes).map((child, childIndex) => renderNode(child, `${key}-task-${index}-${childIndex}`, onNavigate, path))}</li>;
        }
        const checked = match[1].toLowerCase() === "x";
        const taskText = match[2].trim();
        const canToggle = Boolean(planRenderContext.onToggleTask);
        return (
          <li key={`${key}-task-${index}-${checked}`}>
            <label className={cn("flex items-start gap-2", canToggle ? "cursor-pointer" : "cursor-default")}>
              <input
                className="mt-1.5 size-3.5 shrink-0 accent-primary"
                defaultChecked={checked}
                disabled={!canToggle}
                type="checkbox"
                onChange={(event) => void planRenderContext.onToggleTask?.(taskText, event.target.checked)}
              />
              <span className={checked ? "text-muted-foreground line-through" : "text-foreground"}>{taskText}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function renderOpenDecision(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const title = componentTitle(node);
  const detail = node.getAttribute("detail") || node.getAttribute("description") || "";
  const options = directComponentChildren(node, "DecisionOption");
  const otherChildren = Array.from(node.childNodes).filter(
    (child) => !(child instanceof Element && child.getAttribute("data-plan-component") === "DecisionOption"),
  );
  return (
    <section className="grid gap-3 rounded-md border border-primary/40 bg-secondary/25 p-4" key={key}>
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <MessageSquareText aria-hidden="true" className="size-4 text-primary" />
          <h3 className="m-0 text-sm font-bold leading-snug">{title || "Open decision"}</h3>
        </div>
        {detail ? <p className="m-0 text-sm leading-6 text-muted-foreground">{detail}</p> : null}
      </div>
      {otherChildren.length ? (
        <div className="grid gap-2">
          {otherChildren.map((child, index) => renderNode(child, `${key}-od-${index}`, onNavigate, path))}
        </div>
      ) : null}
      {options.length ? (
        <div className="grid gap-1.5">
          {options.map((option, index) => renderDecisionOption(option, title, `${key}-od-option-${index}`))}
        </div>
      ) : null}
    </section>
  );
}

function renderDecisionOption(option: Element, decisionTitle: string, key: string) {
  const label = option.getAttribute("label") || option.textContent?.trim() || "Option";
  const detail = option.getAttribute("detail") || option.getAttribute("description") || "";
  const recommended = booleanAttr(option, "recommended");
  const canPropose = Boolean(planRenderContext.onProposeChange);
  const propose = () => {
    const pagePath = planRenderContext.path || "this plan page";
    planRenderContext.onProposeChange?.(
      `Resolve the open decision "${decisionTitle || "Open decision"}" in ${pagePath} by choosing: "${label}". Update the plan accordingly: record it as a Decision with rationale and consequences, adjust affected stages or units, and remove the resolved OpenDecision block.`,
    );
  };
  return (
    <button
      className={cn(
        "grid gap-0.5 rounded-md border bg-card px-3 py-2 text-left transition-colors",
        recommended && "border-primary",
        canPropose ? "cursor-pointer hover:bg-accent" : "cursor-default",
      )}
      disabled={!canPropose}
      key={key}
      type="button"
      onClick={propose}
    >
      <span className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-6 text-foreground">
        {label}
        {recommended ? <Badge>recommended</Badge> : null}
        {canPropose ? <span className="text-xs font-normal text-muted-foreground">choose → modify plan</span> : null}
      </span>
      {detail ? <span className="text-xs leading-5 text-muted-foreground">{detail}</span> : null}
    </button>
  );
}

function cardStatusBorderClass(value: string) {
  const normalized = value.toLowerCase();
  if (/blocked|danger|deprecated|high|critical|rejected/.test(normalized)) return "border-l-destructive";
  if (/current|active|recommended/.test(normalized)) return "border-l-primary";
  return "border-l-border";
}

function cardGroupClass(node: Element) {
  const cols = node.getAttribute("cols") || node.getAttribute("columns") || "";
  if (cols === "2") return "grid grid-cols-1 gap-3 md:grid-cols-2";
  if (cols === "3") return "grid grid-cols-1 gap-3 md:grid-cols-3";
  if (cols === "4") return "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";
  return "grid grid-cols-1 gap-3";
}

function columnsClass(_node: Element) {
  return "grid grid-cols-1 gap-4";
}

function renderTabs(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const tabs = directComponentChildren(node, "Tab");
  if (!tabs.length) return <div className="grid gap-3" key={key}>{Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate, path))}</div>;

  const values = tabs.map((tab, index) => tab.getAttribute("value") || slugValue(componentTitle(tab) || `tab-${index + 1}`));
  const defaultValue = node.getAttribute("defaultValue") || node.getAttribute("default") || values[0];
  return (
    <UiTabs className="rounded-lg border bg-card p-4" defaultValue={defaultValue} key={key}>
      <TabsList className="max-w-full flex-wrap justify-start">
        {tabs.map((tab, index) => (
          <TabsTrigger key={values[index]} value={values[index]}>
            {componentTitle(tab) || `Tab ${index + 1}`}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab, index) => (
        <TabsContent className="grid gap-3 pt-3" key={values[index]} value={values[index]}>
          {Array.from(tab.childNodes).map((child, childIndex) => renderNode(child, `${key}-${index}-${childIndex}`, onNavigate, path))}
        </TabsContent>
      ))}
    </UiTabs>
  );
}

function renderAccordionGroup(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = directComponentChildren(node, "AccordionItem").concat(directComponentChildren(node, "Accordion"));
  if (!items.length) return <div className="grid gap-3" key={key}>{Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate, path))}</div>;
  return (
    <UiAccordion className="rounded-lg border bg-card px-4" collapsible key={key} type="single">
      {items.map((item, index) => renderAccordionItem(item, `${key}-${index}`, onNavigate, path, index))}
    </UiAccordion>
  );
}

function renderAccordionItem(node: Element, key: string, onNavigate: (path: string) => void, path?: string, index = 0) {
  const value = node.getAttribute("value") || slugValue(componentTitle(node) || `item-${index + 1}`);
  return (
    <AccordionItem key={key} value={value}>
      <AccordionTrigger>{componentTitle(node) || `Item ${index + 1}`}</AccordionTrigger>
      <AccordionContent className="grid gap-3">
        {Array.from(node.childNodes).map((child, childIndex) => renderNode(child, `${key}-${childIndex}`, onNavigate, path))}
      </AccordionContent>
    </AccordionItem>
  );
}

function componentTitle(node: Element) {
  return node.getAttribute("title") || node.getAttribute("label") || node.getAttribute("name") || "";
}

function booleanAttr(node: Element, name: string) {
  const value = node.getAttribute(name);
  return value !== null && value !== "false";
}

function directComponentChildren(node: Element, component: string) {
  return Array.from(node.children).filter((child) => child.getAttribute("data-plan-component") === component);
}

function isCalloutComponent(component: string) {
  return ["Callout", "Note", "Tip", "Warning", "Danger", "Check"].includes(component);
}

function calloutKind(component: string) {
  if (component === "Danger") return "danger";
  if (component === "Warning") return "warning";
  if (component === "Tip") return "tip";
  if (component === "Check") return "check";
  if (component === "Note") return "note";
  return "info";
}

function calloutTitle(kind: string) {
  const titles: Record<string, string> = {
    check: "Check",
    danger: "Danger",
    info: "Note",
    note: "Note",
    tip: "Tip",
    warning: "Warning",
  };
  return titles[kind] || "Note";
}

function calloutIcon(kind: string, icon: string) {
  if (icon === "none") return null;
  if (kind === "danger") return <ShieldAlert className="size-4" />;
  if (kind === "warning") return <AlertCircle className="size-4" />;
  if (kind === "tip") return <Lightbulb className="size-4" />;
  if (kind === "check") return <CheckCircle2 className="size-4" />;
  return <Info className="size-4" />;
}

// Canonical plan-section components. Self-title from the tag name; `title` overrides.
// Keep these default labels in sync with the Rust hint table in
// src-tauri/src/domain/wiki.rs (mdx_component_markdown_hint) so the Markdown
// derivative still carries the section words the plan validators look for.
const planSectionDefaults: Record<string, string> = {
  Scope: "Scope",
  ImplementationNotes: "Implementation",
  Dependencies: "Dependencies/Blockers",
  Verification: "Verification",
  CompletionGate: "Completion Gate",
};

// Single accent: every section icon uses the theme primary. The custom per-section
// layout (not color) is what differentiates the sections.
function planSectionIcon(component: string) {
  const className = "size-4 shrink-0 text-primary";
  if (component === "Scope") return <Target aria-hidden="true" className={className} />;
  if (component === "ImplementationNotes") return <CodeXml aria-hidden="true" className={className} />;
  if (component === "Dependencies") return <CircleSlash2 aria-hidden="true" className={className} />;
  if (component === "CompletionGate") return <FlagTriangleRight aria-hidden="true" className={className} />;
  return <ShieldCheck aria-hidden="true" className={className} />;
}

function planSectionHeader(component: string, heading: string, trailing?: ReactNode) {
  return (
    <div className="flex items-center gap-2 border-b border-border/60 pb-2">
      {planSectionIcon(component)}
      <h2 className="m-0 text-sm font-bold leading-tight text-foreground">{heading}</h2>
      {trailing}
    </div>
  );
}

function planSectionItems(node: Element) {
  return Array.from(node.querySelectorAll(":scope > ul > li, :scope > ol > li"));
}

// Scope: accent-marked rows; bold lead-ins (rendered as <strong>) read as item titles.
function renderScopeItems(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = planSectionItems(node);
  if (!items.length) return null;
  return (
    <ul className="m-0 grid list-none gap-2.5 p-0">
      {items.map((item, index) => (
        <li className="flex gap-2.5 text-sm leading-6 text-muted-foreground" key={`${key}-scope-${index}`}>
          <span aria-hidden="true" className="flex h-6 shrink-0 items-center">
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          <div className="min-w-0">{Array.from(item.childNodes).map((child, childIndex) => renderNode(child, `${key}-scope-${index}-${childIndex}`, onNavigate, path))}</div>
        </li>
      ))}
    </ul>
  );
}

// Implementation: numbered rows with accent index badges.
function renderNumberedItems(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = planSectionItems(node);
  if (!items.length) return null;
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {items.map((item, index) => (
        <li className="flex gap-3 text-sm leading-6 text-muted-foreground" key={`${key}-note-${index}`}>
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{index + 1}</span>
          <div className="min-w-0">{Array.from(item.childNodes).map((child, childIndex) => renderNode(child, `${key}-note-${index}-${childIndex}`, onNavigate, path))}</div>
        </li>
      ))}
    </ol>
  );
}

const verificationKinds = [
  { re: /^(automated|auto)\s*:/i, label: "Auto", icon: Terminal, accent: true, muted: false },
  { re: /^manual\s*:/i, label: "Manual", icon: MousePointerClick, accent: false, muted: false },
  { re: /^(deferred|defer)\s*:/i, label: "Deferred", icon: Clock, accent: false, muted: true },
];

// Verification: split list items into Auto / Manual / Deferred check rows when the
// content follows that convention; otherwise return null to fall back to a plain list.
function renderVerificationChecks(node: Element, key: string, onNavigate: (path: string) => void, path?: string) {
  const items = planSectionItems(node);
  if (!items.length) return null;
  const matched = items.some((item) => verificationKinds.some((kind) => kind.re.test((item.textContent || "").trim())));
  if (!matched) return null;
  return (
    <div className="grid gap-2.5">
      {items.map((item, index) => {
        const text = (item.textContent || "").trim();
        const kind = verificationKinds.find((entry) => entry.re.test(text));
        const body = Array.from(item.childNodes).map((child, childIndex) => {
          if (childIndex === 0 && kind && child.nodeType === Node.TEXT_NODE) {
            return (child.textContent || "").replace(kind.re, "").replace(/^\s+/, "");
          }
          return renderNode(child, `${key}-check-${index}-${childIndex}`, onNavigate, path);
        });
        if (!kind) {
          return (
            <div className="flex gap-2.5 text-sm leading-6 text-muted-foreground" key={`${key}-check-${index}`}>
              <span aria-hidden="true" className="flex h-6 shrink-0 items-center">
                <span className="size-1.5 rounded-full bg-primary" />
              </span>
              <div className="min-w-0">{body}</div>
            </div>
          );
        }
        const Icon = kind.icon;
        return (
          <div className="flex items-start gap-2.5 text-sm leading-6" key={`${key}-check-${index}`}>
            <span className="flex h-6 shrink-0 items-center">
              <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium", kind.accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                <Icon className="size-3" aria-hidden="true" />
                {kind.label}
              </span>
            </span>
            <div className={cn("min-w-0", kind.muted ? "text-muted-foreground/75" : "text-muted-foreground")}>{body}</div>
          </div>
        );
      })}
    </div>
  );
}

function statusBadgeVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = value.toLowerCase();
  if (normalized.includes("blocked") || normalized.includes("danger") || normalized.includes("deprecated")) return "destructive";
  if (normalized.includes("active") || normalized.includes("current") || normalized === "open" || normalized === "fixing") return "default";
  if (normalized.includes("complete") || normalized === "fixed" || normalized === "verified" || normalized === "closed") return "secondary";
  if (normalized.includes("planned") || normalized.includes("draft")) return "secondary";
  return "outline";
}

function slugValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function normalizeTitleChildren(children: ReactNode[]) {
  return children.map((child) => typeof child === "string" ? normalizePlanDisplayTitle(child) : child);
}

function resolveWikiLink(href: string, currentPath?: string) {
  if (href.startsWith("/wiki/")) return href;

  const projectWikiMatch = href.match(/^\/projects\/[^/]+(\/wiki\/.*)$/);
  if (projectWikiMatch) return projectWikiMatch[1];

  if (!currentPath || href.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  if (!href.startsWith("./") && !href.startsWith("../") && !href.endsWith(".mdx")) return null;

  const [targetPath] = href.split("#");
  const baseParts = currentPath.split("/").slice(0, -1);
  for (const part of targetPath.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }

  const resolved = baseParts.join("/");
  return resolved.startsWith("/wiki/") ? resolved : null;
}

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function decodeCommonHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

const svgElementTags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "marker",
  "title",
]);

const svgChildTags = new Set([...svgElementTags].filter((tag) => tag !== "svg" && tag !== "title"));

const svgAttributeMap: Record<string, string> = {
  "aria-hidden": "aria-hidden",
  "aria-label": "aria-label",
  cx: "cx",
  cy: "cy",
  d: "d",
  "dominant-baseline": "dominantBaseline",
  dx: "dx",
  dy: "dy",
  fill: "fill",
  "fill-opacity": "fillOpacity",
  "font-family": "fontFamily",
  "font-size": "fontSize",
  "font-weight": "fontWeight",
  height: "height",
  id: "id",
  "marker-end": "markerEnd",
  "marker-mid": "markerMid",
  "marker-start": "markerStart",
  markerheight: "markerHeight",
  markerwidth: "markerWidth",
  opacity: "opacity",
  orient: "orient",
  points: "points",
  preserveaspectratio: "preserveAspectRatio",
  r: "r",
  refx: "refX",
  refy: "refY",
  role: "role",
  rx: "rx",
  ry: "ry",
  stroke: "stroke",
  "stroke-dasharray": "strokeDasharray",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "stroke-opacity": "strokeOpacity",
  "stroke-width": "strokeWidth",
  "text-anchor": "textAnchor",
  transform: "transform",
  viewbox: "viewBox",
  width: "width",
  x: "x",
  x1: "x1",
  x2: "x2",
  y: "y",
  y1: "y1",
  y2: "y2",
};

function renderSvgElement(node: Element, key: string, isRoot = false): ReactNode {
  const tag = node.tagName.toLowerCase();
  if (!svgElementTags.has(tag)) return null;
  if (tag === "title") return createElement("title", { key }, node.textContent || "");

  const props: Record<string, string> = {};
  for (const attr of Array.from(node.attributes)) {
    const prop = svgAttributeMap[attr.name.toLowerCase()];
    if (!prop) continue;
    const value = sanitizeSvgAttributeValue(prop, attr.value);
    if (value === null) continue;
    props[prop] = value;
  }

  const children = Array.from(node.childNodes)
    .map((child, index) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return tag === "text" || tag === "tspan" ? child.textContent : null;
      }
      return child instanceof Element ? renderSvgElement(child, `${key}-${index}`) : null;
    })
    .filter((child) => child !== null && child !== "");

  if (tag !== "svg") return createElement(tag, { ...props, key }, ...children);

  const svg = createElement(
    "svg",
    {
      ...props,
      key: `${key}-svg`,
      className: props.width ? "h-auto max-w-full" : "h-auto w-full",
      xmlns: "http://www.w3.org/2000/svg",
    },
    ...children,
  );
  if (!isRoot) return svg;
  return (
    <div className="overflow-x-auto rounded-md border bg-card p-3 text-foreground" key={key}>
      {svg}
    </div>
  );
}

function sanitizeSvgAttributeValue(prop: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || /[<>]/.test(trimmed) || /javascript:/i.test(trimmed)) return null;
  if (prop === "fill" || prop === "stroke") {
    if (/^(currentcolor|none|transparent)$/i.test(trimmed)) return trimmed;
    if (/^var\(--[a-z0-9-]+\)$/i.test(trimmed)) return trimmed;
    if (/^#[0-9a-f]{3,8}$/i.test(trimmed)) return trimmed;
    if (/^[a-z]+$/i.test(trimmed)) return trimmed;
    return null;
  }
  if (prop === "markerEnd" || prop === "markerMid" || prop === "markerStart") {
    return /^url\(#[a-z0-9_-]+\)$/i.test(trimmed) ? trimmed : null;
  }
  if (prop === "id") {
    return /^[a-z][a-z0-9_-]*$/i.test(trimmed) ? trimmed : null;
  }
  if (/url\(/i.test(trimmed)) return null;
  return trimmed;
}
