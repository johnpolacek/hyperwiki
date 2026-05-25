import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MdxPlanRendererProps {
  source: string;
  markdown?: string;
  onNavigate: (path: string) => void;
}

const componentTags = [
  "PlanHero",
  "PlanSummary",
  "PlanUnit",
  "Decision",
  "Evidence",
  "Verification",
  "Callout",
  "CommandBlock",
];

export function MdxPlanRenderer({ source, markdown, onNavigate }: MdxPlanRendererProps) {
  const content = useMemo(() => renderTrustedMdx(source, onNavigate), [source, onNavigate]);
  if (!source.trim()) {
    return <div className="p-8 text-sm text-muted-foreground">No plan source loaded.</div>;
  }
  return (
    <article className="h-full overflow-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[72rem] flex-col gap-6 px-6 py-8 md:px-10">
        {content}
        {markdown ? <span className="sr-only" data-markdown-derivative={markdown.length}>Markdown derivative available</span> : null}
      </div>
    </article>
  );
}

function renderTrustedMdx(source: string, onNavigate: (path: string) => void) {
  if (typeof DOMParser === "undefined") return null;
  const html = mdxBodyToHtml(source);
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  return Array.from(document.body.firstElementChild?.childNodes || []).map((node, index) => renderNode(node, `${index}`, onNavigate));
}

function mdxBodyToHtml(source: string) {
  const body = normalizeComponentTags(stripFrontmatter(source).replaceAll("className=", "class="));
  const html: string[] = [];
  let inCode = false;
  let code = "";
  let inList = false;
  for (const line of body.split(/\r?\n/)) {
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
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  if (inList) html.push("</ul>");
  return html.join("\n");
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

function renderNode(node: ChildNode, key: string, onNavigate: (path: string) => void): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate));
  const className = node.getAttribute("class") || "";
  const component = node.getAttribute("data-plan-component") || "";
  const classTokens = new Set(className.split(/\s+/).filter(Boolean));

  if (component === "CommandBlock") {
    return <pre className="overflow-auto rounded-md border bg-secondary px-4 py-3 font-mono text-xs leading-6" key={key}>{children}</pre>;
  }
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    return (
      <a
        className="font-semibold text-primary underline-offset-4 hover:underline"
        href={href}
        key={key}
        onClick={(event) => {
          if (!href.startsWith("/wiki/") && !href.startsWith("/projects/")) return;
          event.preventDefault();
          const projectWikiMatch = href.match(/^\/projects\/[^/]+(\/wiki\/.*)$/);
          onNavigate(projectWikiMatch?.[1] || href);
        }}
      >
        {children}
      </a>
    );
  }
  if (tag === "h1") return <h1 className="m-0 text-4xl font-bold leading-tight md:text-5xl" key={key}>{children}</h1>;
  if (tag === "h2") return <h2 className="m-0 text-2xl font-bold leading-tight" key={key}>{children}</h2>;
  if (tag === "h3") return <h3 className="m-0 text-lg font-bold leading-snug" key={key}>{children}</h3>;
  if (tag === "p") return <p className="m-0 text-sm leading-7 text-muted-foreground" key={key}>{children}</p>;
  if (tag === "strong") return <strong className="font-bold text-foreground" key={key}>{children}</strong>;
  if (tag === "code") return <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]" key={key}>{children}</code>;
  if (tag === "pre") return <pre className="overflow-auto rounded-md border bg-secondary px-4 py-3 font-mono text-xs leading-6" key={key}>{children}</pre>;
  if (tag === "ul") return <ul className="m-0 grid gap-2 pl-5 text-sm leading-7 text-muted-foreground" key={key}>{children}</ul>;
  if (tag === "ol") return <ol className="m-0 grid gap-2 pl-5 text-sm leading-7 text-muted-foreground" key={key}>{children}</ol>;
  if (tag === "li") return <li key={key}>{children}</li>;
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

  if (isHero) return <section className="grid gap-5 border-b pb-8" key={key}>{children}</section>;
  if (isSummary) return <section className="grid gap-3 rounded-md border bg-secondary/50 p-4" key={key}>{children}</section>;
  if (isStage) return <section className="grid gap-5 border-t pt-8" key={key}>{children}</section>;
  if (isUnit) return <article className="grid gap-3 rounded-md border bg-card p-4" key={key}>{children}</article>;
  if (isPanel) return <section className="grid gap-4 rounded-md border bg-card p-5" key={key}>{children}</section>;
  if (tag === "section") return <section className="grid gap-4" key={key}>{children}</section>;
  if (tag === "article") return <article className="grid gap-3" key={key}>{children}</article>;
  if (tag === "div") return <div className="grid gap-3" key={key}>{children}</div>;

  return <span key={key}>{children}</span>;
}

function inlineMarkdown(value: string) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
