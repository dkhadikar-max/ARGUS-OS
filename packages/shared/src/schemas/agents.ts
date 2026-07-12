import { z } from "zod";
import { messageToneSchema, verdictSchema } from "./enums.js";

const confidence = z.number().min(0).max(100);
const score100 = z.number().min(0).max(100);

// Bible §8.3 — Research Agent output_format
export const researchAgentOutputSchema = z.object({
  summary: z.string(),
  data_points: z.array(
    z.object({
      type: z.enum([
        "firmographic",
        "demographic",
        "technographic",
        "intent",
        "risk",
      ]),
      signal: z.string(),
      relevance: z.string(),
    }),
  ),
  unfair_advantages: z.array(z.string()),
  hidden_risks: z.array(z.string()),
  confidence,
  data_gaps: z.array(z.string()),
});
export type ResearchAgentOutput = z.infer<typeof researchAgentOutputSchema>;

// Bible §8.4 — ICP Agent output_format
export const icpAgentOutputSchema = z.object({
  score: score100,
  criteria_evaluated: z.array(
    z.object({
      criterion: z.string(),
      weight: z.number().min(0).max(1),
      match: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
      evidence: z.string(),
      reasoning: z.string(),
    }),
  ),
  overall_assessment: z.string(),
  edge_cases: z.array(z.string()),
  confidence,
});
export type IcpAgentOutput = z.infer<typeof icpAgentOutputSchema>;

// Bible §8.5 — Intent Agent output_format
export const intentAgentOutputSchema = z.object({
  score: score100,
  signals: z.array(
    z.object({
      signal: z.string(),
      raw_score: z.number().min(0).max(10),
      weighted_score: z.number().min(0).max(10),
      recency_days: z.number().min(0),
      reasoning: z.string(),
    }),
  ),
  trajectory: z.enum(["increasing", "stable", "decreasing", "unknown"]),
  false_intent_flags: z.array(z.string()),
  confidence,
});
export type IntentAgentOutput = z.infer<typeof intentAgentOutputSchema>;

// Bible §8.6 — Risk Agent output_format
export const riskAgentOutputSchema = z.object({
  score: score100,
  risks: z.array(
    z.object({
      category: z.string(),
      severity: z.enum(["dealbreaker", "moderate", "minor"]),
      description: z.string(),
      evidence: z.string(),
      mitigation: z.string(),
    }),
  ),
  red_flags: z.array(z.string()),
  time_waste_probability: score100,
  mitigation_strategies: z.array(z.string()),
  confidence,
});
export type RiskAgentOutput = z.infer<typeof riskAgentOutputSchema>;

// Bible §8.7 — Judge Agent output_format
export const judgeAgentOutputSchema = z.object({
  verdict: verdictSchema,
  confidence,
  weighted_score: score100,
  agent_consensus: z.enum(["high", "medium", "low"]),
  conflicts: z.array(z.string()),
  reasoning: z.string(),
  key_evidence: z.array(z.string()),
  message: z.object({
    linkedin: z.string(),
    email: z.string().nullable(),
    tone: messageToneSchema,
    personalization_hooks: z.array(z.string()),
  }),
  recommended_action: z.enum([
    "message_now",
    "research_more",
    "wait_for_signal",
    "pass_and_move_on",
  ]),
  confidence_explanation: z.string(),
});
export type JudgeAgentOutput = z.infer<typeof judgeAgentOutputSchema>;

// Bible §8.2 — Master Orchestrator combined JSON object returned by the
// single Claude call (5 specialist agents + judge, all in one response).
export const agentDebateOutputSchema = z.object({
  research: researchAgentOutputSchema,
  icp: icpAgentOutputSchema,
  intent: intentAgentOutputSchema,
  risk: riskAgentOutputSchema,
  judge: judgeAgentOutputSchema,
});
export type AgentDebateOutput = z.infer<typeof agentDebateOutputSchema>;

// Bible §8.8 Learning Agent output_format. Deliberately not "applied"
// anywhere in the schema layer -- prompt_adjustments and icp_recommendations
// are recommendations for a human to review (the prompt's own constraint:
// "never change prompts without human review in first 90 days"), not
// instructions the system acts on automatically.
export const learningAgentOutputSchema = z.object({
  accuracy_by_verdict: z.record(verdictSchema, score100),
  systematic_errors: z.array(z.string()),
  patterns: z.array(
    z.object({
      pattern: z.string(),
      evidence: z.string(),
      confidence: score100,
      recommendation: z.string(),
    }),
  ),
  prompt_adjustments: z.array(
    z.object({
      agent: z.string(),
      current: z.string(),
      suggested: z.string(),
      reason: z.string(),
    }),
  ),
  icp_recommendations: z.array(z.string()),
  priority: z.enum(["high", "medium", "low"]),
});
export type LearningAgentOutput = z.infer<typeof learningAgentOutputSchema>;
