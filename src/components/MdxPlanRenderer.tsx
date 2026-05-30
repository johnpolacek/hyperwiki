import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { normalizePlanDisplayTitle } from "@/lib/wiki-title";

interface MdxPlanRendererProps {
  source: string;
  markdown?: string;
  onNavigate: (path: string) => void;
  path?: string;
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

export function MdxPlanRenderer({ source, markdown, onNavigate, path }: MdxPlanRendererProps) {
  const content = useMemo(() => renderTrustedMdx(source, onNavigate, path), [source, onNavigate, path]);
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

function renderTrustedMdx(source: string, onNavigate: (path: string) => void, path?: string) {
  if (typeof DOMParser === "undefined") return null;
  const html = mdxBodyToHtml(source);
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  return Array.from(document.body.firstElementChild?.childNodes || []).map((node, index) => renderNode(node, `${index}`, onNavigate, path));
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

function renderNode(node: ChildNode, key: string, onNavigate: (path: string) => void, path?: string): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof Element)) return null;

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map((child, index) => renderNode(child, `${key}-${index}`, onNavigate, path));
  const titleChildren = normalizeTitleChildren(children);
  const className = node.getAttribute("class") || "";
  const component = node.getAttribute("data-plan-component") || "";
  const classTokens = new Set(className.split(/\s+/).filter(Boolean));

  if (component === "CommandBlock") {
    return <pre className="overflow-auto rounded-md border bg-secondary px-4 py-3 font-mono text-xs leading-6" key={key}>{children}</pre>;
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
  if (tag === "h1") return <h1 className="m-0 text-2xl font-bold leading-tight md:text-3xl" key={key}>{titleChildren}</h1>;
  if (tag === "h2") return <h2 className="m-0 text-lg font-bold leading-tight md:text-xl" key={key}>{titleChildren}</h2>;
  if (tag === "h3") return <h3 className="m-0 text-base font-bold leading-snug" key={key}>{titleChildren}</h3>;
  if (tag === "p") return <p className="m-0 text-sm leading-7 text-muted-foreground" key={key}>{children}</p>;
  if (tag === "strong") return <strong className="font-bold text-foreground" key={key}>{children}</strong>;
  if (tag === "code") return <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.9em]" key={key}>{children}</code>;
  if (tag === "pre") return <pre className="overflow-auto rounded-md border bg-secondary px-4 py-3 font-mono text-xs leading-6" key={key}>{children}</pre>;
  if (tag === "table") return <div className="overflow-x-auto rounded-md border" key={key}><table className="w-full border-collapse text-sm">{children}</table></div>;
  if (tag === "thead") return <thead className="bg-secondary/70 text-foreground" key={key}>{children}</thead>;
  if (tag === "tbody") return <tbody className="divide-y" key={key}>{children}</tbody>;
  if (tag === "tr") return <tr key={key}>{children}</tr>;
  if (tag === "th") return <th className="px-3 py-2 text-left font-bold leading-6" key={key}>{children}</th>;
  if (tag === "td") return <td className="px-3 py-2 align-top leading-6 text-muted-foreground" key={key}>{children}</td>;
  if (tag === "ul") return <ul className="m-0 list-disc space-y-1.5 pb-5 pl-6 text-sm font-normal leading-7 text-muted-foreground marker:text-muted-foreground/65" key={key}>{children}</ul>;
  if (tag === "ol") return <ol className="m-0 list-decimal space-y-1.5 pb-5 pl-6 text-sm font-normal leading-7 text-muted-foreground marker:text-muted-foreground/65" key={key}>{children}</ol>;
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

  if (isHero) return <section className="grid gap-5 border-b pb-8" key={key}>{children}</section>;
  if (isSummary) return <section className="grid gap-3 rounded-md border bg-secondary/50 p-4" key={key}>{children}</section>;
  if (isStage) return <section className="grid gap-5 border-t pt-8" key={key}>{children}</section>;
  if (isUnit) return <article className="grid gap-3 rounded-md border bg-card p-4" key={key}>{children}</article>;
  if (isPanel) return <section className="grid gap-4 rounded-md border bg-card p-5" key={key}>{children}</section>;
  if (tag === "section") return <section className="grid gap-3" key={key}>{children}</section>;
  if (tag === "article") return <article className="grid gap-3" key={key}>{children}</article>;
  if (tag === "div") return <div className="grid gap-3" key={key}>{children}</div>;

  return <span key={key}>{children}</span>;
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
