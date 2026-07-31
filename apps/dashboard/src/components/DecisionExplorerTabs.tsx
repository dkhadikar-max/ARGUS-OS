"use client";

import { useState } from "react";
import type { AdminShadowDecisionDetailResponse } from "@argus/shared";
import { DecisionComparisonPanel } from "./DecisionComparisonPanel";
import { ConfidenceDeltaBar } from "./ConfidenceDeltaBar";
import { DisagreementTaxonomyList } from "./DisagreementTaxonomyList";
import { DecisionMetadataFooter } from "./DecisionMetadataFooter";
import { EvidenceSummaryList } from "./EvidenceSummaryList";
import { AgentOutputsView } from "./AgentOutputsView";
import { ExecutionTraceView } from "./ExecutionTraceView";

type TabId = "overview" | "evidence" | "agent-outputs" | "execution-trace";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "evidence", label: "Evidence" },
  { id: "agent-outputs", label: "Agent Outputs" },
  { id: "execution-trace", label: "Execution Trace" },
];

// Per feedback: tabs, not stacked sections -- agent outputs dwarf
// everything else, and operators should see the verdict comparison
// immediately without scrolling past it. Local useState, no URL state --
// a tab switch isn't something that needs to be linkable.
export function DecisionExplorerTabs({ detail }: { detail: AdminShadowDecisionDetailResponse }) {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id ? "border-teal-600 text-teal-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <DecisionComparisonPanel live={detail.liveDecision} shadow={detail.shadowDecision} />
          <ConfidenceDeltaBar confidenceDelta={detail.comparison.confidenceDelta} />
          <DisagreementTaxonomyList
            verdictAgreement={detail.comparison.verdictAgreement}
            controllerComparisonApplicable={detail.comparison.controllerComparisonApplicable}
            disagreementCategories={detail.comparison.disagreementCategories}
          />
          <DecisionMetadataFooter live={detail.liveDecision} shadow={detail.shadowDecision} model={detail.model} />
        </div>
      )}

      {tab === "evidence" && <EvidenceSummaryList evidence={detail.liveDecision.evidence} />}

      {tab === "agent-outputs" && (
        <div className="space-y-4">
          <AgentOutputsView title="Live agent output" agentOutputs={detail.liveDecision.agentOutputs} />
          <AgentOutputsView title="Shadow agent output" agentOutputs={detail.shadowDecision.agentOutputs} />
        </div>
      )}

      {tab === "execution-trace" && (
        <ExecutionTraceView
          executionId={detail.executionId}
          controllerAction={detail.shadowDecision.controllerAction}
          controllerTargetCapability={detail.shadowDecision.controllerTargetCapability}
          controllerReasons={detail.shadowDecision.controllerReasons}
          executionTrace={detail.shadowDecision.executionTrace}
        />
      )}
    </div>
  );
}
