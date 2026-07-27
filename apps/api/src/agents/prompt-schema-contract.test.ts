import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  researchAgentOutputSchema,
  icpAgentOutputSchema,
  intentAgentOutputSchema,
  riskAgentOutputSchema,
  judgeAgentOutputSchema,
} from "@argus/shared";
import {
  RESEARCH_AGENT_PROMPT,
  ICP_AGENT_PROMPT,
  INTENT_AGENT_PROMPT,
  RISK_AGENT_PROMPT,
  JUDGE_AGENT_PROMPT,
} from "./prompts.js";

// Bug fix (Critical #8): 3 real, distinct Judge prompt/schema contract
// violations were caught this session, all reactively -- after a live or
// eval failure, never before one. The "Prompt/Schema Contract Checklist"
// tracking issue opened earlier this session is manual review discipline,
// not a structural safeguard: nothing stops the next prompt edit from
// reintroducing the same class of drift.
//
// This is the one item from that checklist that's genuinely mechanically
// checkable: "does output_format show every field the schema's required
// fields actually demand -- including fields nested inside array items,
// not just top-level ones." It would NOT have caught all 3 real bugs
// (message-as-string was a runtime model deviation from an already-correct
// prompt, not a prompt authoring defect; the pass_and_move_on/null-message
// contradiction is a cross-field semantic constraint (a Zod .refine()),
// not a structural shape difference no static text-vs-schema comparison
// can decide in general). It WOULD have caught the mitigation-omission
// bug (a required nested field silently missing from an array item's own
// example) and prevents that whole class from regressing silently again --
// this runs in `npm test`, so a future prompt edit that drops a required
// field from its own example fails the build, not just a checklist item
// someone might skip.
//
// Deliberately not attempted: checking cross-field constraints (the
// pass_and_move_on case) or runtime model compliance (the message-as-
// string case) -- both need either arbitrary code introspection or a live
// model call, neither of which a prompt-vs-schema structural diff can
// honestly provide. Documented here as a known, permanent limit of this
// test, not silently uncovered.

/** Every field name a Zod schema's own real shape demands, at every level
 *  (top-level object keys, plus every key inside any array-of-objects
 *  field) -- walks .refine()-wrapped schemas (ZodEffects) and array item
 *  types (ZodArray.element) so it works unmodified against the real
 *  judgeAgentOutputSchema (which is refine()-wrapped) and every array
 *  field across all 5 real schemas. */
function schemaFieldNames(schema: z.ZodTypeAny): string[] {
  const names = new Set<string>();

  function unwrap(s: z.ZodTypeAny): z.ZodTypeAny {
    if (s instanceof z.ZodEffects) return unwrap(s._def.schema as z.ZodTypeAny);
    if (s instanceof z.ZodOptional || s instanceof z.ZodNullable) return unwrap(s._def.innerType as z.ZodTypeAny);
    return s;
  }

  function walk(s: z.ZodTypeAny) {
    const real = unwrap(s);
    if (real instanceof z.ZodObject) {
      for (const [key, value] of Object.entries(real.shape as Record<string, z.ZodTypeAny>)) {
        names.add(key);
        walk(value);
      }
    } else if (real instanceof z.ZodArray) {
      walk(real.element as z.ZodTypeAny);
    }
  }

  walk(schema);
  return [...names];
}

/** Every quoted `"key":` in a prompt's own <output_format> block. Extracted
 *  via regex, not JSON.parse -- these blocks are JSON-shaped illustrations
 *  with inline type hints ("score": 0-100, "match": 0|0.5|1), not literal
 *  JSON, so they don't actually parse as JSON. The field-name-presence
 *  question this test asks doesn't need real parsing, just real key
 *  extraction. */
function outputFormatFieldNames(prompt: string): string[] {
  const match = prompt.match(/<output_format>([\s\S]*?)<\/output_format>/);
  if (!match) throw new Error("Prompt has no <output_format> block -- cannot check its contract with the schema");
  const block = match[1] ?? "";
  return [...block.matchAll(/"(\w+)":/g)].map((m) => m[1] as string);
}

const AGENT_CONTRACTS = [
  { name: "research", schema: researchAgentOutputSchema, prompt: RESEARCH_AGENT_PROMPT },
  { name: "icp", schema: icpAgentOutputSchema, prompt: ICP_AGENT_PROMPT },
  { name: "intent", schema: intentAgentOutputSchema, prompt: INTENT_AGENT_PROMPT },
  { name: "risk", schema: riskAgentOutputSchema, prompt: RISK_AGENT_PROMPT },
  { name: "judge", schema: judgeAgentOutputSchema, prompt: JUDGE_AGENT_PROMPT },
] as const;

describe("prompt/schema field contract", () => {
  for (const { name, schema, prompt } of AGENT_CONTRACTS) {
    it(`${name}: every real schema field (including fields nested inside array items) appears in the prompt's own output_format example`, () => {
      const required = schemaFieldNames(schema);
      const shown = new Set(outputFormatFieldNames(prompt));
      const missing = required.filter((field) => !shown.has(field));

      expect(missing, `${name}_agent_output_schema requires these fields, but ${name}'s output_format example never shows them: ${missing.join(", ")}`).toEqual([]);
    });
  }

  // Proves the checker itself is real, not vacuous (a check that can never
  // fail is worthless as a safeguard) -- schemaFieldNames/
  // outputFormatFieldNames must actually be able to detect a real absence.
  it("actually detects a missing nested field (self-test, not a real prompt)", () => {
    const nestedSchema = z.object({ items: z.array(z.object({ a: z.string(), b: z.string() })) });
    const incompletePrompt = `<output_format>\n{ "items": [ { "a": "" } ] }\n</output_format>`;

    const required = schemaFieldNames(nestedSchema);
    const shown = new Set(outputFormatFieldNames(incompletePrompt));
    const missing = required.filter((field) => !shown.has(field));

    expect(missing).toEqual(["b"]);
  });
});
