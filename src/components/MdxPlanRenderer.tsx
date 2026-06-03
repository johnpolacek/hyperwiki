import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Code2,
  FileText,
  Folder,
  Info,
  Lightbulb,
  MessageSquareText,
  ShieldAlert,
  Sparkles,
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
}

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
  "Callout",
  "Note",
  "Tip",
  "Warning",
  "Danger",
  "Check",
  "Panel",
  "Frame",
  "Card",
  "CardGroup",
  "Columns",
  "Column",
  "Aside",
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

export function MdxPlanRenderer({ source, markdown, status, validationWarnings = [], onNavigate, canDeletePlan = false, onDeletePlan, path }: MdxPlanRendererProps) {
  const content = useMemo(() => renderTrustedMdx(source, onNavigate, path, status), [source, onNavigate, path, status]);
  const [copyStatus, setCopyStatus] = useState("");
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const copyMarkdown = async () => {
    if (!markdown?.trim()) return;
    try {
      await navigator.clipboard?.writeText(markdown);
      setCopyStatus("Markdown copied");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Could not copy Markdown");
    }
  };
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
        {markdown || canDeletePlan ? (
          <div className="pointer-events-none absolute right-3 top-5 z-10 flex items-start gap-1.5">
            {markdown ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="Copy Markdown"
                    className="pointer-events-auto h-8 gap-1.5 px-2.5 text-xs"
                    disabled={!markdown.trim()}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={copyMarkdown}
                  >
                    {copyStatus === "Markdown copied" ? (
                      <CheckCircle2 aria-hidden="true" data-icon="inline-start" />
                    ) : (
                      <Copy aria-hidden="true" data-icon="inline-start" />
                    )}
                    <span>Copy</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">{copyStatus || "Copy Markdown"}</TooltipContent>
              </Tooltip>
            ) : null}
            {canDeletePlan ? (
              isDeleteConfirming ? (
                <div className="pointer-events-auto flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm">
                  <Button
                    aria-label="Cancel plan deletion"
                    className="h-7 px-2 text-xs"
                    disabled={isDeletingPlan}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setIsDeleteConfirming(false);
                      setDeleteStatus("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    aria-label="Delete plan"
                    className="h-7 px-2 text-xs"
                    disabled={isDeletingPlan}
                    size="sm"
                    type="button"
                    variant="destructive"
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
            ) : null}
            <span className="sr-only" aria-live="polite">{copyStatus || deleteStatus}</span>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-[68rem] flex-col gap-4 px-5 py-5 md:px-8">
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
          {content}
          {markdown ? <span className="sr-only" data-markdown-derivative={markdown.length}>Markdown derivative available</span> : null}
        </div>
      </TooltipProvider>
    </article>
  );
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
    const open = new RegExp(`<${tag}(\\s|>)`, "g");
    const close = new RegExp(`</${tag}>`, "g");
    return current
      .replace(open, `<section data-plan-component="${tag}"$1`)
      .replace(close, "</section>");
  }, source);
}

function renderNode(node: ChildNode, key: string, onNavigate: (path: string) => void, path?: string, pageStatus?: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
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
  if (tag === "svg") return <div className="overflow-auto rounded-md border bg-background p-3" key={key}>{children}</div>;
  if (tag === "path" || tag === "rect" || tag === "text" || tag === "defs" || tag === "marker") return null;

  const isHero = component === "PlanHero" || classTokens.has("hero") || classTokens.has("import-hero");
  const isSummary = component === "PlanSummary" || classTokens.has("summary") || classTokens.has("status-grid");
  const isStage = classTokens.has("stage");
  const isUnit = component === "PlanUnit" || classTokens.has("unit");
  const isPanel = classTokens.has("panel") || classTokens.has("decision-panel") || component === "Decision" || component === "Evidence" || component === "Verification" || component === "Callout";

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
    return (
      <Card className="rounded-md py-3 shadow-none" key={key}>
        {title || description ? (
          <CardHeader className="px-3">
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

  if (component === "RequestExample" || component === "ResponseExample") {
    return renderExamplePanel(node, component, children, key);
  }

  if (component === "Decision" || component === "Evidence" || component === "Verification") {
    return (
      <section className="grid gap-2 py-1" key={key}>
        {title ? <h2 className="m-0 text-base font-bold leading-tight">{title}</h2> : null}
        {description ? <p className="m-0 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        <div className="grid gap-2">{children}</div>
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
        <CardContent className="grid gap-2 px-3">{children}</CardContent>
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
    return renderCodeBlock(node, children, key);
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

function renderCodeBlock(node: Element, children: ReactNode[], key: string) {
  const code = (node.textContent || "").trim();
  const title = componentTitle(node);
  const language = node.getAttribute("language") || node.getAttribute("lang") || "";
  return (
    <div className="overflow-hidden rounded-md border bg-card" key={key}>
      <div className="flex items-center justify-between gap-3 border-b bg-secondary/50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Code2 className="size-3.5 shrink-0" />
          <span className="truncate">{title || language || "Code"}</span>
        </div>
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
      <ScrollArea className="max-h-[28rem]">
        <pre className="m-0 p-3 font-mono text-xs leading-5">{children}</pre>
      </ScrollArea>
    </div>
  );
}

function cardGroupClass(_node: Element) {
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

function statusBadgeVariant(value: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = value.toLowerCase();
  if (normalized.includes("blocked") || normalized.includes("danger") || normalized.includes("deprecated")) return "destructive";
  if (normalized.includes("complete") || normalized.includes("active") || normalized.includes("current")) return "default";
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
    .replace(/`([^`]+)`/g, "<code>$1</code>");
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
