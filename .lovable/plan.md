## Goal

Make the agent response feel like a simple Q&A — short, direct answer — while still showing which agents ran behind the scenes as compact status chips (not their full reports).

## Changes (frontend only — `src/routes/index.tsx`)

### 1. Collapse the verbose agent cards into compact status chips

Remove the large Cost / Market / Risk / Router cards that dump each agent's full markdown report. Replace them with a single horizontal "Agents" strip showing one small chip per agent with:

- Icon + name (Router, Cost, Market, Risk)
- Status dot: Running (spinner) → Done (check) / Skipped (dimmed)
- No body text, no markdown reports inline

Add a single "Show agent details" toggle (closed by default). When expanded, render the existing `AgentMarkdown` outputs in an accordion. Power users can still see the raw reports; default view stays clean.

### 2. Make the final answer the hero

Promote the Orchestrator's `finalRecommendation` to a single prominent "Answer" card directly under the query box — large, readable, markdown-rendered, no surrounding agent grid clutter. Drop the "Final verdict" framing in favor of a simple Q&A header ("Your question" / "Answer").

### 3. Tighten the routing-reason display

Show the router's reason as one muted line above the agent chips ("Routed to Cost + Market because…"), not as its own card.

### 4. Keep behavior identical

No changes to `src/lib/agents.js`, `/api/agent`, scoring, or data flow. Only the `AiPanel` / `AgentCard` / layout JSX changes. The same `orchestrator` call, same state shape, same statuses.

## Out of scope

- Streaming per-agent updates
- Chat-style threaded conversation
- Backend / orchestrator logic changes

## Files touched

- `src/routes/index.tsx` — rewrite `AiPanel`, replace `AgentCard` grid with chip strip + collapsible details + hero Answer card.
