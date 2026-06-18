# Dynamic Routing Orchestrator

Replace the fixed Cost → Market → Risk → Final pipeline with an LLM-routed flow that runs only the specialists needed for the user's query.

## 1. Rewrite `src/lib/agents.js`

Keep `costAgent`, `marketAgent`, `riskAgent` as-is (they already wrap `callAgent` with try/catch and use the proxy). Replace `orchestrator` and add a routing helper.

- **`routeQuery(query)`** — single `callAgent` with the routing system prompt provided in the request. User message = the raw `query`. Strip ```json fences, `JSON.parse` inside try/catch, default to `{ agents: ["COST","MARKET","RISK"], reason: "routing failed, running all agents" }` on any failure. Also default if `agents` is missing/empty or not an array.

- **`adjustCostsFromQuery(query, costs)`** — pure JS. Regex for `/fuel\s+(rises|increases|up|drops|falls|down)\s+(\d+(?:\.\d+)?)\s*%/i` and similar for generic "cost". Apply the delta to a clone of `costs` (e.g. `fuelPerGal *= 1.10`). Return original costs if no match.

- **`rescoreCandidates(candidates, location, adjustedCosts)`** — re-run `scoreLoad` from `./profitEngine` over each candidate's original `load` using `location.lat/lng` and adjusted costs, then re-sort by `netPerMile`. Only called when costs actually changed.

- **`orchestrator(query, candidates, location, costs)`** — new signature:
  1. `const routing = await routeQuery(query)`.
  2. `const wanted = new Set(routing.agents)`.
  3. If `wanted.has("COST")` and query mentions fuel/cost change → `adjusted = adjustCostsFromQuery(...)`; if changed, `candidates = rescoreCandidates(...)`.
  4. Run agents in fixed order COST → MARKET → RISK, but only those in `wanted`, in parallel via `Promise.all` over the filtered list. Store results into `findings` keyed by `COST` / `MARKET` / `RISK`.
  5. Build synthesis user message: `Driver location: <location.city>\n\n` + for each ran agent `"<NAME> ANALYST REPORT:\n<text>\n\n"`.
  6. `finalRecommendation = await callAgent(synthSystemPrompt, userMsg)` wrapped in try/catch (return error string on failure).
  7. Return `{ agentsUsed: [...orderedRanAgents], routingReason: routing.reason, findings, finalRecommendation }`.

All API calls remain proxied through `/api/agent` (no direct Anthropic fetch — the proxy already targets the Lovable AI Gateway with the same response shape; `callAgent` already does `data.content.filter(...)` equivalent server-side and returns `data.text`). Keep that as-is so CORS + key handling stays correct.

## 2. Update `src/routes/index.tsx` consumer

The current `runAgents` hardcodes three parallel specialists + final. Replace with a single call:

- Add `query` state (textarea or default string `"Find the best load from my location"`) so routing has something to route on. Pre-populate with a sensible default; expose a small input above the Find button.
- Replace the three `costAgent/marketAgent/riskAgent` calls with `const result = await orchestrator(query, candidates, selected, costs)`.
- New agent state shape: `Record<"router" | "cost" | "market" | "risk" | "final", AgentState>`. Mark all initially `idle`; immediately `router → running` before the call, then once `result` returns, derive each card's status from `result.agentsUsed` (`done` with `findings[KEY]`) or `skipped` (new status) when not in `agentsUsed`. Final card shows `result.finalRecommendation`. Router card shows `result.routingReason`.
- Add `"skipped"` to `AgentStatus` union; `StatusPill` and `AgentCard` render it as a muted "Skipped" chip with a short note ("Not needed for this query").
- Since `orchestrator` is now one awaited call, we lose per-agent streaming. Acceptable for this change; cards flip from `running` → `done`/`skipped` together. (Out of scope: per-agent streaming would require splitting orchestrator into client-driven steps.)

## 3. Out of scope

- No changes to `/api/agent` proxy, scoring engine, or the markdown renderer.
- No DB/job-queue/background processing; the existing proxy already handles latency.
- No new dependencies.

## Files touched

- `src/lib/agents.js` — rewrite `orchestrator`, add `routeQuery`, `adjustCostsFromQuery`, `rescoreCandidates`.
- `src/routes/index.tsx` — add query input, replace `runAgents` body, extend agent state with `router` + `skipped`, render router card and skipped-state cards.
