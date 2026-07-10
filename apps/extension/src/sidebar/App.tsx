import { useCallback, useEffect, useState } from "react";
import type { DecisionResponse, Verdict } from "@argus/shared";
import { api, auth } from "../lib/api-client.js";
import { extractProfileFromDom } from "../lib/linkedin-selectors.js";
import { LoadingSkeleton } from "./components/LoadingSkeleton.js";
import { VerdictCard } from "./components/VerdictCard.js";
import { EvidenceAccordion } from "./components/EvidenceAccordion.js";
import { MessageComposer } from "./components/MessageComposer.js";
import { VerdictActions } from "./components/VerdictActions.js";

// Bible §7.2 EXT-5: full Clerk OAuth handshake lives in the web dashboard
// (Epic 5, not yet built in this pass) — the sidebar only consumes a token
// already issued there. Until that flow exists, an unauthenticated rep is
// pointed at the dashboard rather than the sidebar silently failing.
const DASHBOARD_SIGN_IN_URL = "http://localhost:3000/sign-in";

type Status = "checking_auth" | "unauthenticated" | "loading" | "success" | "error";

interface Props {
  onClose: () => void;
}

export function App({ onClose }: Props) {
  const [status, setStatus] = useState<Status>("checking_auth");
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const requestDecision = useCallback(async (userId: string, teamId: string) => {
    setStatus("loading");
    setError(null);
    setSelectedVerdict(null);

    const profile = extractProfileFromDom();
    if (!profile.name) {
      setStatus("error");
      setError("Couldn't read this profile. LinkedIn's layout may have changed.");
      return;
    }

    try {
      const result = await api.createDecision({
        prospect: {
          linkedInUrl: profile.linkedInUrl,
          name: profile.name,
          title: profile.title ?? undefined,
          companyName: profile.companyName ?? undefined,
        },
        context: {
          source: "linkedin_sidebar",
          trigger: "profile_view",
          userId,
          teamId,
        },
        options: {
          generateMessage: true,
          messageChannel: "LINKEDIN",
          messageTone: "professional",
          includeDebate: false,
        },
      });
      setDecision(result);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    auth.get().then((stored) => {
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      void requestDecision(stored.userId, stored.teamId);
    });
  }, [requestDecision]);

  async function handleOverride(newVerdict: Verdict, reason?: string) {
    if (!decision) return;
    setSelectedVerdict(newVerdict);
    try {
      await api.overrideDecision(decision.id, { newVerdict, reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record override.");
    }
  }

  function handleAccept(verdict: Verdict) {
    // Bible §10 defines /decisions/{id}/override but no explicit endpoint
    // for a same-verdict "accept" (ActionTaken exists in §9.1 but has no
    // REST contract in §10) — recorded as a known Week-2 gap. For now the
    // sidebar reflects the acceptance locally so the rep gets feedback.
    setSelectedVerdict(verdict);
  }

  async function handleRegenerate() {
    const stored = await auth.get();
    if (!stored) return;
    setRegenerating(true);
    await requestDecision(stored.userId, stored.teamId);
    setRegenerating(false);
  }

  return (
    <div className="flex h-full w-full flex-col bg-white text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="text-sm font-bold tracking-wide text-gray-900">ARGUS</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close ARGUS sidebar"
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {status === "checking_auth" && <LoadingSkeleton />}

        {status === "unauthenticated" && (
          <div className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-gray-600">Sign in to see verdicts on this profile.</p>
            <button
              type="button"
              onClick={() => window.open(DASHBOARD_SIGN_IN_URL, "_blank", "noopener,noreferrer")}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Sign in to ARGUS
            </button>
          </div>
        )}

        {status === "loading" && <LoadingSkeleton />}

        {status === "error" && (
          <div className="p-4 text-sm text-red-600">{error}</div>
        )}

        {status === "success" && decision && (
          <div className="space-y-4 p-4">
            <VerdictCard decision={decision} />
            <EvidenceAccordion evidence={decision.evidence} />
            <MessageComposer
              message={decision.message}
              onRegenerate={handleRegenerate}
              regenerating={regenerating}
            />
            <VerdictActions
              currentVerdict={decision.verdict}
              onAccept={handleAccept}
              onOverride={handleOverride}
              submitting={false}
              selectedVerdict={selectedVerdict}
            />
          </div>
        )}
      </div>
    </div>
  );
}
