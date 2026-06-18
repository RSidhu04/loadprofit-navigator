The agent cards currently dump raw model output into a `<pre>` tag, so markdown (`**bold**`, `##` headings, `-` bullets, numbered lists) shows literal asterisks and hashes and wraps awkwardly. Fix the presentation layer only — no changes to the agents, the proxy, or the orchestration.

## What changes

1. **Add a markdown renderer.** Install `react-markdown` + `remark-gfm` and create a small `<AgentMarkdown>` component in `src/routes/index.tsx` that maps markdown elements to themed Tailwind classes (headings → small uppercase labels, lists → tight bulleted lists with amber markers, `**bold**` → `font-semibold text-foreground`, code → muted chip, paragraphs → relaxed leading).

2. **Restyle the Agent Activity cards.**
   - Replace the `<pre>` body with `<AgentMarkdown>`.
   - Give specialist cards (Cost/Market/Risk) a tighter two-column header (icon tile + title + status pill on the right) and a soft inner content surface for the markdown.
   - Emphasize the Orchestrator card: amber border + subtle gradient background, a "Final verdict" eyebrow, larger title, and the chosen load ID pulled out as a chip when present in the text.
   - Use the existing semantic tokens (`primary`, `muted`, `border`, amber accents) — no hardcoded colors.

3. **Polish the running / queued states.**
   - Queued: dim card, dashed left accent.
   - Running: animated shimmer line + "Working…" caption (already there, just restyled).
   - Done: subtle emerald check in the status pill, content fades in.

4. **Layout.** Keep the pipeline order (Cost → Market → Risk → Orchestrator). On md+ screens, lay the three specialists in a 3-column grid and the Orchestrator full-width below, so the final verdict reads as the conclusion. On small screens, stack vertically as today.

## Out of scope

- No changes to `agents.js`, `/api/agent`, or the scoring engine.
- No new prompts or model changes.
- No design-direction prototypes — this is a deterministic styling pass on an existing component.

## Files touched

- `package.json` / `bun.lock` — add `react-markdown`, `remark-gfm`.
- `src/routes/index.tsx` — `AgentCard`, `AiPanel`, and a new local `AgentMarkdown` component.
