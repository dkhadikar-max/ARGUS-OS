/** Anthropic-style forced tool-use schema shared by every agent stage's tool
 *  definition (RESEARCH_TOOL, ICP_TOOL, etc. in orchestrator.ts) and by the
 *  LLMProvider interface that wraps the actual API call. Moved here from
 *  orchestrator.ts (v4 roadmap Phase 1) so provider code doesn't import
 *  from the file that imports providers -- no behavior change, same shape. */
export type ToolSchema = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
};
