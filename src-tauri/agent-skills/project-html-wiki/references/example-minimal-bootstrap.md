# Example Minimal Bootstrap

Use this example for output density and tone. It shows a thin greenfield `bootstrap_new` for a hypothetical project called `Link Minder`, a tiny CLI idea with no confirmed implementation stack yet.

## Example `wiki/index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Link Minder Wiki</title>
  <style>body{font-family:system-ui,sans-serif;margin:0;background:#f7f7f4;color:#1f2629}main{max-width:920px;margin:auto;padding:32px}section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0}</style>
</head>
<body>
  <main>
    <h1>Link Minder Wiki</h1>
    <p>Link Minder is a proposed small CLI that checks a list of URLs and reports broken links. Current context is thin: no implementation language, package manager, hosting target, or release workflow has been chosen.</p>
    <section><h2>Current Focus</h2><p>Preserve the project idea, identify missing technical decisions, and avoid scaffold handoff recommendations until the stack is chosen.</p></section>
    <section><h2>Core Pages</h2><ul><li><a href="AGENTS.md">AGENTS.md</a></li><li><a href="log.html">log.html</a></li><li><a href="Sources.html">Sources.html</a></li><li><a href="plans/index.html">plans/index.html</a></li><li><a href="roadmap.html">roadmap.html</a></li></ul></section>
    <section><h2>Source Briefs</h2><p>No separate source briefs were generated. Current evidence does not justify a PRD, technical brief, marketing brief, or design brief.</p></section>
  </main>
</body>
</html>
```

## Example `wiki/Sources.html`

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link Minder Sources</title></head>
<body>
  <main>
    <a href="index.html">Back to wiki index</a>
    <h1>Sources</h1>
    <section><h2>Source Material</h2><p>User prompt: "Make a small tool that checks links in a text file."</p></section>
    <section><h2>Repository Evidence</h2><ul><li>New empty project folder.</li><li>Git initialized during bootstrap.</li><li>No package manifest, source files, tests, or existing documentation.</li></ul></section>
    <section><h2>Generated Source Briefs</h2><p>None generated yet. Current evidence does not justify separate source briefs.</p></section>
    <section><h2>Unknowns</h2><ul><li>Implementation language and package manager.</li><li>Input file format.</li><li>Expected output format and exit-code behavior.</li><li>Whether this should be a CLI only or also expose a library API.</li></ul></section>
  </main>
</body>
</html>
```

## Example `wiki/roadmap.html`

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link Minder Roadmap</title></head>
<body>
  <main>
    <a href="index.html">Back to wiki index</a>
    <h1>Roadmap</h1>
    <section><h2>Current Goal</h2><p>Turn the link-checker idea into a decision-complete implementation plan.</p></section>
    <section><h2>Next Decision</h2><p>Choose the implementation language, CLI behavior, and validation approach.</p></section>
    <section><h2>Next Steps</h2><ol><li>Decide the runtime and package manager.</li><li>Define accepted input and output formats.</li><li>Create an implementation plan before adding code.</li></ol></section>
    <section><h2>Deferred</h2><ul><li>Package publishing.</li><li>Parallel link checking.</li><li>HTML crawling beyond explicit URLs in an input file.</li></ul></section>
  </main>
</body>
</html>
```

## Example Handoff Summary

```html
Created a `bootstrap_new` project wiki for `Link Minder`.

Created: `AGENTS.md`, `wiki/AGENTS.md`, `wiki/index.html`, `wiki/log.html`, `wiki/Sources.html`, `wiki/plans/index.html`, `wiki/roadmap.html`.
Skipped: `.agents/skills/project-wiki-maintainer/SKILL.md` because repo-local skills were not already in use or explicitly requested.
Source briefs: none generated; source context is thin.
Git: initialized new repository.
Unknowns: runtime, input format, output format, test approach.
Next action: choose the runtime and CLI behavior, then create a plan before adding code.
```
