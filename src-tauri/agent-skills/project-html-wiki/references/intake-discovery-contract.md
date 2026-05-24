# Intake Discovery Contract

Use `intake_discovery` when the user wants to start a software project but has no repo, no PRD, no notes, no project idea, or only a vague prompt such as "I want to build something." This mode gathers enough user-confirmed direction before the Project HTML Wiki Skill creates any wiki artifacts.

## Purpose

Intake discovery turns zero context into source context. It is not product ideation for its own sake, app scaffold generation, or wiki bootstrap. Its output is either a concise intake summary for the user to confirm later, or a confirmed handoff to `bootstrap_new`.

## Non-Write Rule

During `intake_discovery`, do not create or update:

- `AGENTS.md`
- `CLAUDE.md`
- `wiki/`
- `wiki/Sources.html`
- source briefs
- roadmap files
- plans
- repo-local skills
- app scaffold files
- dependency manifests

If the user explicitly asks to create files before minimum context exists, explain that the skill needs intake first to avoid inventing project direction.

## Zero-Context Triggers

Run intake when there is no concrete source context and the user says or implies:

- "I want to build something."
- "Help me figure out a new project."
- "Start a project from scratch."
- "I do not have an idea yet."
- "I need an app idea."
- "Use this skill but I have no repo/notes/PRD."

Do not run intake when the user already supplied thin but concrete context, such as a rough app idea, target audience, source notes, PRD, existing repo, or explicit unknowns to preserve. Thin context can proceed to `bootstrap_new` with unknowns named.

## Question Batches

Ask one focused batch at a time. Prefer 3-7 questions. Avoid broad brainstorming prompts that invite unsupported invention.

### Batch 1: Direction

Use when the user has no idea or only a vague project desire.

- What project type would be useful: personal tool, internal business tool, public app, library, automation, learning project, or something else?
- Who should benefit from it first?
- What problem, annoyance, workflow, or opportunity should it address?
- What would count as a useful first result?
- Are there constraints such as budget, timeline, stack, platform, privacy, data sources, or skills you want to practice or avoid?

### Batch 2: Product Shape

Use after the user names a broad direction but not enough bootstrap context.

- What should the first user be able to do end to end?
- What interface shape seems most appropriate: web app, website, dashboard, CLI, API, mobile app, desktop app, browser extension, automation script, or library?
- What data, integrations, files, or manual inputs does it depend on?
- What should be out of scope for the first milestone?
- What risk or unknown should the wiki preserve instead of resolving now?

### Batch 3: Bootstrap Confirmation

Use when answers appear sufficient for bootstrap.

- Working title:
- Target user/audience:
- Project purpose/problem:
- Primary outcome / desired outcome:
- Product/interface type:
- Known constraints:
- Explicit unknowns:
- First useful milestone:

Ask the user to confirm or correct the summary before creating files. Proceed to `bootstrap_new` only when they confirm enough direction or explicitly ask to proceed with named unknowns.

## Minimum Viable Context

Do not hand off to `bootstrap_new` until the intake summary includes:

- project name or working title
- target user or audience
- project purpose or problem
- primary outcome the project should deliver
- rough product or interface type
- known constraints, or explicit unknowns that should be recorded

The first useful milestone is strongly recommended. If it is unknown, record it as an explicit unknown and keep the bootstrap roadmap conservative.

## Stopping Rules

Stop at intake and do not create files when:

- the user has not answered enough questions to meet minimum viable context
- the user is still choosing between materially different project directions
- audience, purpose, or primary outcome is missing
- interface shape is unknown and would affect root project setup or source briefs
- constraints or unknowns are unclear enough that generated roadmap or plan content would be speculative

Proceed to `bootstrap_new` only when:

- minimum viable context exists
- the target project root is known or can be safely created
- the user confirms the summary or explicitly says to continue with the recorded unknowns

## Handoff Shape

When stopping at intake, respond with:

- Mode: `intake_discovery`
- Status: stopped before file creation
- Confirmed context
- Missing context
- Recommended next answer or decision
- Clear statement that no wiki, guidance, roadmap, plan, or scaffold files were created

When proceeding to bootstrap, respond or record in working notes:

- Mode: `intake_discovery` -> `bootstrap_new`
- Confirmed intake summary
- Explicit unknowns to preserve in `wiki/Sources.html`
- Any source briefs justified by the confirmed context
- Any source briefs intentionally skipped because evidence is thin

## Validation Expectations

Valid zero-context behavior:

- asks focused intake questions
- does not invent a product direction, stack, roadmap, source brief, or implementation plan
- does not create files
- clearly says whether it stopped at intake or proceeded to bootstrap

Invalid zero-context behavior:

- creates `wiki/` or `AGENTS.md` before minimum context exists
- chooses a stack or scaffold from no context
- writes source briefs or roadmap certainty from vague prompts
- presents a feature plan as if product direction were confirmed
