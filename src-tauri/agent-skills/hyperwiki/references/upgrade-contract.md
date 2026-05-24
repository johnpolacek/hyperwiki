# Upgrade Contract

Use this reference when auditing or upgrading a project that was previously bootstrapped by this skill.

## Principles

- Preserve user-authored project files, wiki pages, source context, and Git history.
- Add missing standard artifacts when safe.
- Replace only managed blocks that use recognized Project MDX Wiki Skill markers.
- Do not rewrite generated-looking MDX wholesale unless it is inside a managed block.
- Hyperwiki is MDX-first in test mode. Existing HTML wiki files should be treated as stale legacy artifacts unless the user explicitly asks to preserve them.
- Report artifacts as `present_but_not_upgraded` when no safe update boundary exists.

## Managed Marker Versions

Current marker:

```markdown
<!-- HYPERWIKI-SKILL:START v1 -->
...
<!-- HYPERWIKI-SKILL:END -->
```

Legacy Project HTML Wiki markers may be recognized only to avoid duplicate managed blocks during explicit migration:

```markdown
<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
...
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

If a file has legacy HTML markers and the user explicitly requests migration, replace only the content inside the managed block and update the markers to `HYPERWIKI-SKILL:START v1`. Preserve all content outside the markers.

## Files With Managed Blocks

Managed block replacement is allowed for:

- `AGENTS.md`
- `CLAUDE.md` when it already exists or the user explicitly requested Claude Code local guidance
- `wiki/AGENTS.mdx`

For files without managed blocks, preserve by default:

- `wiki/index.mdx`
- `wiki/log.mdx`
- `wiki/sources.mdx`
- `wiki/plans/index.mdx`
- `wiki/roadmap.mdx`
- source briefs under `wiki/sources/`
- stale `wiki/**/*.html` artifacts until explicit reset or migration

## Additive Upgrade Behavior

When a required MDX artifact is missing, create it from the current baseline template.

When an artifact exists:

- append to `wiki/log.mdx`
- preserve `wiki/sources.mdx` and add only clearly missing source-index sections when doing so does not disturb user content
- preserve `wiki/index.mdx`; add missing links only when the existing structure makes a safe insertion obvious
- preserve `wiki/plans/index.mdx`; report `present_but_not_upgraded` if it lacks the current planning rule
- preserve `wiki/roadmap.mdx`; report `present_but_not_upgraded` if it has a different structure
- report legacy HTML pages as stale unless the user explicitly asked to preserve them

## Upgrade Handoff

End an upgrade with:

- upgraded managed blocks
- created missing artifacts
- preserved existing artifacts
- stale legacy HTML artifacts
- `present_but_not_upgraded` artifacts
- skipped artifacts and reasons
- unresolved unknowns or contradictions
- Git result
