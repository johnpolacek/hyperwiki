# Upgrade Contract

Use this reference when auditing or upgrading a project that was previously bootstrapped by this skill.

## Principles

- Preserve user-authored project files, wiki pages, source context, and Git history.
- Add missing standard artifacts when safe.
- Replace only managed blocks that use recognized Project HTML Wiki Skill markers.
- Do not rewrite generated-looking HTML wholesale unless it is inside a managed block.
- Report artifacts as `present_but_not_upgraded` when no safe update boundary exists.

## Managed Marker Versions

Current marker:

```markdown
<!-- PROJECT-HTML-WIKI-SKILL:START v2 -->
...
<!-- PROJECT-HTML-WIKI-SKILL:END -->
```

Earlier `PROJECT-HTML-WIKI-SKILL:START v1` markers are recognized and may be upgraded to `v2` when replacing a managed block.

Legacy `PROJECT-WIKI-BOOTSTRAPPER` markers are treated as `v0`:

```markdown
<!-- PROJECT-WIKI-BOOTSTRAPPER:START -->
...
<!-- PROJECT-WIKI-BOOTSTRAPPER:END -->
```

When upgrading a `v0` or `v1` block to `v2`, replace only the content inside the block and update the markers to the current `PROJECT-HTML-WIKI-SKILL` prefix with the start marker set to `v2`. Preserve all content outside the markers.

## Files With Managed Blocks

Managed block replacement is allowed for:

- `AGENTS.md`
- `CLAUDE.md` when it already exists or the user explicitly requested Claude Code local guidance
- `wiki/AGENTS.md`

For files without managed blocks, preserve by default:

- `wiki/index.html`
- `wiki/log.html`
- `wiki/Sources.html`
- `wiki/plans/index.html`
- `wiki/roadmap.html`
- source briefs under `wiki/sources/`

## Additive Upgrade Behavior

When a required artifact is missing, create it from the current baseline template.

When an artifact exists:

- append to `wiki/log.html`
- preserve `wiki/Sources.html` and add only clearly missing source-index sections when doing so does not disturb user content
- preserve `wiki/index.html`; add missing links only when the existing structure makes a safe insertion obvious
- preserve `wiki/plans/index.html`; report `present_but_not_upgraded` if it lacks the current planning rule
- preserve `wiki/roadmap.html`; report `present_but_not_upgraded` if it has a different structure

## Upgrade Handoff

End an upgrade with:

- upgraded managed blocks
- created missing artifacts
- preserved existing artifacts
- `present_but_not_upgraded` artifacts
- skipped artifacts and reasons
- unresolved unknowns or contradictions
- Git result
