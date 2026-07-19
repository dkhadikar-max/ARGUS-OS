import { AppError } from "@argus/shared";
import { anthropic, CLAUDE_MODEL } from "../../agents/claude-client.js";

// No Bible section defines this (see schema.prisma's Team.companyContext
// comment) -- fetches the seller's own website once and asks Claude to
// draft a short profile the onboarding wizard shows for the user to
// edit/confirm before saving, rather than saving an AI summary silently.
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 20_000;

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_HTML_CHARS);
}

export async function suggestCompanyContextFromWebsite(websiteUrl: string): Promise<string> {
  let html: string;
  try {
    const response = await fetch(websiteUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "ArgusOnboardingBot/1.0" },
    });
    if (!response.ok) {
      throw new Error(`Website responded with status ${response.status}`);
    }
    html = await response.text();
  } catch (err) {
    throw new AppError(
      "ENRICHMENT_FAILED",
      `Couldn't fetch ${websiteUrl}. Check the URL and try again.`,
      undefined,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }

  const pageText = stripHtmlToText(html);
  if (pageText.length < 50) {
    throw new AppError(
      "ENRICHMENT_FAILED",
      "That page didn't have enough text content to summarize.",
    );
  }

  try {
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system:
        "You write short, factual company profiles from raw website text for a B2B sales tool. " +
        "Output 3-5 plain-text sentences covering: what the company sells, who it's for, and its " +
        "value proposition or tone. No markdown, no headers, no preamble -- just the profile text.",
      messages: [{ role: "user", content: pageText }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text content");
    }
    return textBlock.text.trim();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      "AI_UNAVAILABLE",
      "Couldn't generate a company profile right now. Try again shortly.",
      undefined,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
}
