/**
 * agents.js
 * ---------
 * Multi-agent orchestration over a candidate set of pre-scored loads.
 *
 * Each agent is a single Anthropic API call with a distinct system prompt.
 * The orchestrator runs the three specialists in parallel, then makes a
 * final synthesis call that picks the single best load.
 *
 * NOTE: All four functions hit the Anthropic API directly via fetch.
 *       The runtime is expected to inject auth; we do not attach a key here.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1000;

/** Pull the plain-text body out of an Anthropic /v1/messages response. */
function parseText(data) {
  if (!data || !Array.isArray(data.content)) return "";
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Single Anthropic call. Returns the joined text body. */
async function callClaude(systemPrompt, userMessage) {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return parseText(data);
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
    return await callClaude(system, formatCandidates(candidates));
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
    return await callClaude(system, formatCandidates(candidates));
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
    return await callClaude(system, formatCandidates(candidates));
  } catch (err) {
    return `Risk agent error: ${err.message}`;
  }
}

/**
 * Orchestrator — fans out to the three specialists in parallel, then
 * makes a synthesis call that picks the single best load.
 */
export async function orchestrator(candidates, location) {
  const [costReport, marketReport, riskReport] = await Promise.all([
    costAgent(candidates),
    marketAgent(candidates),
    riskAgent(candidates),
  ]);

  const system =
    "You are the Dispatch Orchestrator. Given the Cost Analyst, Market " +
    "Analyst, and Risk Officer reports below, pick the single best load " +
    "and explain in plain English why it beats the highest-gross option — " +
    "especially regarding empty miles on both ends. Output: chosen load " +
    "ID, one-paragraph reasoning, and a 'why not the obvious pick' note.";

  const userMessage = [
    `Driver current location: ${location}`,
    ``,
    `Candidate loads (pre-scored):`,
    formatCandidates(candidates),
    ``,
    `--- COST ANALYST REPORT ---`,
    costReport,
    ``,
    `--- MARKET ANALYST REPORT ---`,
    marketReport,
    ``,
    `--- RISK OFFICER REPORT ---`,
    riskReport,
  ].join("\n");

  try {
    const finalText = await callClaude(system, userMessage);
    return {
      final: finalText,
      reports: { cost: costReport, market: marketReport, risk: riskReport },
    };
  } catch (err) {
    return {
      final: `Orchestrator error: ${err.message}`,
      reports: { cost: costReport, market: marketReport, risk: riskReport },
    };
  }
}
