import type {
  CreateActionRequest,
  CreateActionResponse,
  CreateDecisionRequest,
  CreateOutcomeRequest,
  CreateOutcomeResponse,
  DecisionResponse,
  OverrideDecisionRequest,
  OverrideDecisionResponse,
  ShareDecisionResponse,
} from "@argus/shared";
import type { ExtensionMessage, ExtensionResponse, StoredAuth } from "./messages.js";

function send<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ExtensionResponse<T>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.data);
    });
  });
}

export const auth = {
  get: () => send<StoredAuth | null>({ type: "AUTH_GET" }),
  set: (value: StoredAuth) => send<null>({ type: "AUTH_SET", auth: value }),
  clear: () => send<null>({ type: "AUTH_CLEAR" }),
};

export const api = {
  createDecision: (payload: CreateDecisionRequest) =>
    send<DecisionResponse>({ type: "API_CREATE_DECISION", payload }),

  getDecision: (decisionId: string) =>
    send<DecisionResponse>({ type: "API_GET_DECISION", decisionId }),

  overrideDecision: (decisionId: string, payload: OverrideDecisionRequest) =>
    send<OverrideDecisionResponse>({ type: "API_OVERRIDE_DECISION", decisionId, payload }),

  createOutcome: (payload: CreateOutcomeRequest) =>
    send<CreateOutcomeResponse>({ type: "API_CREATE_OUTCOME", payload }),

  recordAction: (decisionId: string, payload: CreateActionRequest) =>
    send<CreateActionResponse>({ type: "API_RECORD_ACTION", decisionId, payload }),

  shareDecision: (decisionId: string) =>
    send<ShareDecisionResponse>({ type: "API_SHARE_DECISION", decisionId }),
};
