/**
 * agents.js
 * ---------
 * Multi-agent orchestration with dynamic routing.
 *
 * Step 1: A routing LLM call decides which specialists (COST, MARKET, RISK)
 *         are relevant to the user's query.
 * Step 2: Only the selected specialists run, in parallel. If the query
 *         mentions a fuel/cost change, candidates are rescored first.
 * Step 3: A synthesis call picks the single best load and returns labeled
 *         sections (CHOSEN LOAD / REASONING / WHY NOT THE OBVIOUS PICK).
 *
 * Calls are proxied through /api/agent so the browser never touches a
 * provider API directly (CORS) and the gateway key stays server-side.
 */

import { scoreLoad } from "./profitEngine";

const AGENT_PROXY_URL = "/api/agent";

/** Single AI call. Returns the joined text body. */
async function callAgent(systemPrompt, userMessage) {
  const res = await fetch(AGENT_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: systemPrompt, user: userMessage }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Agent proxy ${res.status}`);
  }
  return data.text || "";
}

/**
 * Render the candidate set as a compact, model-friendly table so every
 * agent sees the same numbers without us recomputing anything.
 */
function formatCandidates(candidates) {
  return candidates
    .map((c, i) => {
      const l = c.load;
      const s = c.score;
      return [
        `#${i + 1} id=${l.id}`,
        `${l.origin} -> ${l.dest}`,
        `equip=${l.equipment}`,
        `commodity=${l.commodity}`,
        `weight=${l.weight}`,
        `pu=${l.pu_date}`,
        `gross=$${l.rate.toFixed(0)}`,
        `loadedMi=${l.miles}`,
        `dhIn=${s.deadheadIn.toFixed(0)}mi`,
        `dhOut=${s.deadheadOut.toFixed(0)}mi`,
        `totalMi=${s.totalMiles.toFixed(0)}`,
        `netProfit=$${s.netProfit.toFixed(0)}`,
        `net$/mi=$${s.netPerMile.toFixed(2)}`,
        `dest_exit_score=${l.dest_exit_score.toFixed(2)}`,
      ].join(" | ");
    })
    .join("\n");
}

/** Cost analyst — picks the 3 most financially efficient loads. */
export async function costAgent(candidates) {
  const system =
    "You are a Cost Analyst for a trucking carrier. You are given loads " +
    "with pre-computed net profit, net-per-mile, deadhead-in, and " +
    "deadhead-out miles. Do NOT recalculate — interpret. Identify the 3 " +
    "most financially efficient loads and explain why in one line each.";
  try {
    return await callAgent(system, formatCandidates(candidates));
  } catch (err) {
    return `Cost agent error: ${err.message}`;
  }
}

/** Market analyst — reasons about destination market strength / reload risk. */
export async function marketAgent(candidates) {
  const system =
    "You are a Market Intelligence Analyst. Each load has a dest_exit_score " +
    "(0-1, higher = easier to find the next load there). Flag any " +
    "high-paying loads that drop the truck in a weak market (score < 0.45), " +
    "and highlight loads ending in strong hubs. Reason about reload risk.";
  try {
    return await callAgent(system, formatCandidates(candidates));
  } catch (err) {
    return `Market agent error: ${err.message}`;
  }
}

/** Risk / compliance — flags special requirements and tight windows. */
export async function riskAgent(candidates) {
  const system =
    "You are a Compliance & Risk officer. Flag loads with special " +
    "requirements (hazmat, team, liftgate) or tight delivery windows. " +
    "Note added cost or difficulty.";
  try {
    return await callAgent(system, formatCandidates(candidates));
  } catch (err) {
    return `Risk agent error: ${err.message}`;
  }
}

/**
 * Step 1 — Routing call. Ask the LLM which specialist agents are needed
 * for this query. Returns { agents: string[], reason: string }.
 * Defaults to all three on any parse / network failure.
 */
export async function routeQuery(query) {
  const fallback = {
    agents: ["COST", "MARKET", "RISK"],
    reason: "Routing failed, defaulting to all specialists.",
  };
  const system =
    "You are a Dispatch Orchestrator routing a trucking query to specialist " +
    "agents. Available agents: COST (financial efficiency, net profit, " +
    "deadhead math), MARKET (destination demand, reload risk, next-load " +
    "probability), RISK (hazmat/team/liftgate requirements, tight delivery " +
    'windows). Given the user\'s query, decide which agents are needed. ' +
    'Respond ONLY with valid JSON, no other text: {"agents": ["COST","MARKET"], "reason": "one line"}. ' +
    "Rules: a general 'find best load' needs all three. 'Loads ending in " +
    "strong markets' needs MARKET only. 'What if fuel rises X%' needs COST " +
    "only. 'Any hazmat issues' needs RISK only. Always include at least one agent.";

  try {
    const raw = await callAgent(system, query);
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const valid = ["COST", "MARKET", "RISK"];
    const agents = Array.isArray(parsed.agents)
      ? parsed.agents.map((a) => String(a).toUpperCase()).filter((a) => valid.includes(a))
      : [];
    if (agents.length === 0) return fallback;
    return { agents, reason: typeof parsed.reason === "string" ? parsed.reason : "" };
  } catch {
    return fallback;
  }
}

/**
 * Detect a fuel/cost change phrase in the query and return adjusted costs.
 * Returns { costs, changed } — `changed` is false when no phrase matched.
 */
export function adjustCostsFromQuery(query, costs) {
  if (!query || !costs) return { costs, changed: false };
  const next = { ...costs };
  let changed = false;

  const fuelMatch = query.match(
    /fuel\s+(?:price\s+)?(rises?|increases?|jumps?|up|goes?\s+up|drops?|falls?|down|decreases?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/i,
  );
  if (fuelMatch) {
    const direction = /drop|fall|down|decrease/i.test(fuelMatch[1]) ? -1 : 1;
    const pct = parseFloat(fuelMatch[2]) / 100;
    next.fuelPrice = next.fuelPrice * (1 + direction * pct);
    changed = true;
  }

  const costMatch = query.match(
    /(?:operating\s+)?cost(?:s)?\s+(rises?|increases?|up|drops?|falls?|down|decreases?)\s+(?:by\s+)?(\d+(?:\.\d+)?)\s*%/i,
  );
  if (costMatch) {
    const direction = /drop|fall|down|decrease/i.test(costMatch[1]) ? -1 : 1;
    const pct = parseFloat(costMatch[2]) / 100;
    const mult = 1 + direction * pct;
    next.driverPay *= mult;
    next.insurance *= mult;
    next.maintenance *= mult;
    changed = true;
  }

  return { costs: next, changed };
}

/** Rescore candidates with new costs and re-sort by netPerMile desc. */
export function rescoreCandidates(candidates, location, adjustedCosts) {
  const rescored = candidates.map((c) => ({
    load: c.load,
    score: scoreLoad(c.load, location.lat, location.lng, adjustedCosts),
  }));
  rescored.sort((a, b) => b.score.netPerMile - a.score.netPerMile);
  return rescored;
}

/** Map a routed agent name to its callable. */
const AGENT_FNS = {
  COST: costAgent,
  MARKET: marketAgent,
  RISK: riskAgent,
};

/**
 * Orchestrator — dynamically routes a query, runs only the needed
 * specialists, then synthesizes a final recommendation.
 *
 * @param {string} query
 * @param {Array} candidates  - Pre-scored candidate loads.
 * @param {object} location   - { city, lat, lng }
 * @param {object} costs      - Cost params for potential rescoring.
 * @returns {Promise<{agentsUsed: string[], routingReason: string, findings: object, finalRecommendation: string}>}
 */
export async function orchestrator(query, candidates, location, costs) {
  // Step 1 — routing.
  const routing = await routeQuery(query);
  const wanted = new Set(routing.agents);

  // If the user described a fuel/cost shift and COST is in play, rescore.
  let activeCandidates = candidates;
  if (wanted.has("COST")) {
    const { costs: adjusted, changed } = adjustCostsFromQuery(query, costs);
    if (changed) {
      activeCandidates = rescoreCandidates(candidates, location, adjusted);
    }
  }

  // Step 2 — conditional invocation in fixed order, parallelized.
  const order = ["COST", "MARKET", "RISK"].filter((k) => wanted.has(k));
  const results = await Promise.all(
    order.map((k) => AGENT_FNS[k](activeCandidates).catch((err) => `${k} agent error: ${err.message}`)),
  );
  const findings = {};
  order.forEach((k, i) => {
    findings[k] = results[i];
  });

  // Step 3 — synthesis.
  const synthSystem =
    "You are the Dispatch Orchestrator. You received reports from the " +
    "specialist agents listed below. Pick the single best load for the " +
    "driver and explain in plain English why it wins — especially regarding " +
    "empty/deadhead miles on BOTH ends. If a higher-gross load was passed " +
    "over because it ends in a weak market, explicitly call that out as the " +
    "'why not the obvious pick' note. Output three labeled sections: CHOSEN " +
    "LOAD (id + key numbers), REASONING (one paragraph), WHY NOT THE OBVIOUS " +
    "PICK (one or two sentences).";

  const reportSections = order
    .map((k) => `${k} ANALYST REPORT:\n${findings[k]}`)
    .join("\n\n");

  const synthUser = [
    `Driver current location: ${location.city ?? "unknown"}`,
    ``,
    `Candidate loads (pre-scored):`,
    formatCandidates(activeCandidates),
    ``,
    reportSections,
  ].join("\n");

  let finalRecommendation = "";
  try {
    finalRecommendation = await callAgent(synthSystem, synthUser);
  } catch (err) {
    finalRecommendation = `Orchestrator error: ${err.message}`;
  }

  return {
    agentsUsed: order,
    routingReason: routing.reason,
    findings,
    finalRecommendation,
  };
}
