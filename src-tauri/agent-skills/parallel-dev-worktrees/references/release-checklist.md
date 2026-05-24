# Release Checklist

Use this before publishing the skill package.

- `SKILL.md` exists and its YAML frontmatter parses.
- Required frontmatter fields `name` and `description` exist.
- Referenced files such as `references/generic-worktree-commands.md` exist.
- Markdown links resolve.
- Example commands are syntactically plausible and use placeholders consistently.
- Destructive commands are guarded by dirty-state checks or explicit approval language.
- Ignored local artifacts such as `.DS_Store`, `.env`, and `node_modules/` are absent from release artifacts.
