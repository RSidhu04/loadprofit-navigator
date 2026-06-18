import { createFileRoute } from "@tanstack/react-router";

/**
 * Proxy endpoint for the AI agent pipeline.
 *
 * The browser cannot call provider APIs (Anthropic, etc.) directly because
 * of CORS. This route forwards { system, user } to the Lovable AI Gateway
 * using the OpenAI-compatible Chat Completions endpoint and returns the
 * assistant text.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/agent")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(
              JSON.stringify({ error: "Missing LOVABLE_API_KEY" }),
              { status: 500, headers: { "Content-Type": "application/json", ...cors } },
            );
          }

          const { system, user } = (await request.json()) as { system: string; user: string };

          const res = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              model: MODEL,
              max_tokens: 1000,
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          });

          if (!res.ok) {
            const detail = await res.text().catch(() => "");
            const msg =
              res.status === 429
                ? "Rate limit hit. Wait a moment and try again."
                : res.status === 402
                  ? "AI credits exhausted. Top up in Lovable settings."
                  : `Gateway ${res.status}: ${detail.slice(0, 200)}`;
            return new Response(JSON.stringify({ error: msg }), {
              status: res.status,
              headers: { "Content-Type": "application/json", ...cors },
            });
          }

          const data = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const text = data.choices?.[0]?.message?.content ?? "";
          return new Response(JSON.stringify({ text }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...cors },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ error: (err as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json", ...cors } },
          );
        }
      },
    },
  },
});
