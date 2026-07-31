import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminShadowDecisionDetailResponse } from "@argus/shared";

vi.mock("./DecisionComparisonPanel", () => ({ DecisionComparisonPanel: () => <div>overview-comparison</div> }));
vi.mock("./ConfidenceDeltaBar", () => ({ ConfidenceDeltaBar: () => <div>overview-delta</div> }));
vi.mock("./DisagreementTaxonomyList", () => ({ DisagreementTaxonomyList: () => <div>overview-taxonomy</div> }));
vi.mock("./DecisionMetadataFooter", () => ({ DecisionMetadataFooter: () => <div>overview-metadata</div> }));
vi.mock("./EvidenceSummaryList", () => ({ EvidenceSummaryList: () => <div>evidence-list</div> }));
vi.mock("./AgentOutputsView", () => ({ AgentOutputsView: ({ title }: { title: string }) => <div>agent-output-{title}</div> }));
vi.mock("./ExecutionTraceView", () => ({ ExecutionTraceView: () => <div>execution-trace</div> }));

const { DecisionExplorerTabs } = await import("./DecisionExplorerTabs.js");

function detail(): AdminShadowDecisionDetailResponse {
  return {
    id: "sd_1",
    teamId: "team_1",
    teamName: "DataFlow Inc.",
    prospectId: "prospect_1",
    decisionId: "dec_1",
    executionId: "exec_1",
    packId: "sales-lead-qualification-v1",
    model: "claude-sonnet-4-6",
    liveDecision: {
      verdict: "PASS",
      confidence: 54,
      weightedScore: 38,
      reasoning: "live reasoning",
      recommendedAction: "pass_and_move_on",
      agentConsensus: "high",
      agentOutputs: { judge: { verdict: "PASS" } },
      processingTimeMs: 91000,
      inputTokens: 4900,
      outputTokens: 870,
      inferenceCostUsd: 0.09,
      evidence: [],
      createdAt: "2026-07-30T11:58:00.000Z",
    },
    shadowDecision: {
      verdict: "WAIT",
      confidence: 52,
      weightedScore: 48.5,
      reasoning: "shadow reasoning",
      recommendedAction: "wait_for_signal",
      agentConsensus: "high",
      agentOutputs: { judge: { verdict: "WAIT" } },
      executionTrace: { requestId: "exec_1" },
      controllerAction: "stop",
      controllerTargetCapability: null,
      controllerReasons: ["real reason"],
      processingTimeMs: 93000,
      inputTokens: 5000,
      outputTokens: 900,
      inferenceCostUsd: 0.08,
      createdAt: "2026-07-30T12:00:00.000Z",
    },
    comparison: {
      verdictAgreement: false,
      confidenceDelta: 2,
      controllerComparisonApplicable: true,
      disagreementCategories: ["verdict_mismatch"],
    },
  };
}

describe("DecisionExplorerTabs", () => {
  it("defaults to the Overview tab", () => {
    render(<DecisionExplorerTabs detail={detail()} />);

    expect(screen.getByText("overview-comparison")).toBeInTheDocument();
    expect(screen.queryByText("evidence-list")).not.toBeInTheDocument();
  });

  it("switches to the Evidence tab when clicked", async () => {
    const user = userEvent.setup();
    render(<DecisionExplorerTabs detail={detail()} />);

    await user.click(screen.getByRole("button", { name: "Evidence" }));

    expect(screen.getByText("evidence-list")).toBeInTheDocument();
    expect(screen.queryByText("overview-comparison")).not.toBeInTheDocument();
  });

  it("switches to the Agent Outputs tab and renders both live and shadow views", async () => {
    const user = userEvent.setup();
    render(<DecisionExplorerTabs detail={detail()} />);

    await user.click(screen.getByRole("button", { name: "Agent Outputs" }));

    expect(screen.getByText("agent-output-Live agent output")).toBeInTheDocument();
    expect(screen.getByText("agent-output-Shadow agent output")).toBeInTheDocument();
  });

  it("switches to the Execution Trace tab", async () => {
    const user = userEvent.setup();
    render(<DecisionExplorerTabs detail={detail()} />);

    await user.click(screen.getByRole("button", { name: "Execution Trace" }));

    expect(screen.getByText("execution-trace")).toBeInTheDocument();
  });
});
