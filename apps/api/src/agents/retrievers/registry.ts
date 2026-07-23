import { ResearchRetriever } from "./research-retriever.js";
import { ICPRetriever } from "./icp-retriever.js";
import { IntentRetriever } from "./intent-retriever.js";
import { RiskRetriever } from "./risk-retriever.js";
import type { Retriever } from "./types.js";

/** v4 roadmap Phase 4. One entry per agent stage, matching the pipeline's
 *  own stage names in orchestrator.ts (research/icp/intent/risk). Not yet
 *  consumed anywhere -- see types.ts's module comment for why. */
export const RETRIEVER_REGISTRY: Record<"research" | "icp" | "intent" | "risk", Retriever> = {
  research: new ResearchRetriever(),
  icp: new ICPRetriever(),
  intent: new IntentRetriever(),
  risk: new RiskRetriever(),
};
