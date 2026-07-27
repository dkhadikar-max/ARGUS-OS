import { computeTransitionHash, type DecisionState } from "./decision-state.js";

// Controller & Capability Specification v3.0, Section 1.2 -- "Decision
// State Graph Properties." Begun, not completed, per explicit scope:
// createDecisionStateGraph / getRootState / getCurrentState /
// getStateAtVersion / getPath / appendState only. getBranchPoint / replay /
// branchAt (the spec's "what if" branching machinery) are deliberately
// deferred -- they need real design decisions about what a "branch" even
// means for ARGUS that haven't been made, and nothing calls any of this
// yet regardless: every real DecisionState today is version 0 with no
// parent (see decision-state.ts / controller.ts's own module comments for
// why there's no Controller loop to produce a real version 1). Every real
// graph therefore has exactly one node.
//
// The multi-version logic below (getPath across a range, appendState's
// integrity checks) is real, enforced, and tested against synthetic-but-
// structurally-valid states -- not fabricated data pretending to be real
// production history, and not aspirational code that silently no-ops.
// It's built ahead of there being real multi-version data to exercise it
// with, the same pattern used for controller.ts's decide() and
// reasoning-capability.ts's wrapRetrieverAsCapability.

export interface DecisionStateGraph {
  readonly decisionId: string;
  readonly states: ReadonlyMap<number, DecisionState>;
}

/**
 * Builds a graph from the one real state every decision produces today:
 * version 0, no parent. Throws on anything else -- there's no such thing
 * as a real non-root graph yet, and silently accepting one would let a
 * caller construct a graph that looks valid but isn't grounded in a real
 * decision's actual root.
 */
export function createDecisionStateGraph(rootState: DecisionState): DecisionStateGraph {
  if (rootState.version !== 0 || rootState.parentStateId !== null) {
    throw new Error("createDecisionStateGraph requires a real root state (version 0, parentStateId null)");
  }
  return { decisionId: rootState.id, states: new Map([[0, rootState]]) };
}

export function getRootState(graph: DecisionStateGraph): DecisionState {
  const root = graph.states.get(0);
  if (!root) throw new Error(`DecisionStateGraph ${graph.decisionId} has no root state`);
  return root;
}

export function getCurrentState(graph: DecisionStateGraph): DecisionState {
  const maxVersion = Math.max(...graph.states.keys());
  const state = graph.states.get(maxVersion);
  if (!state) throw new Error(`DecisionStateGraph ${graph.decisionId} has no state at its own max version`);
  return state;
}

export function getStateAtVersion(graph: DecisionStateGraph, version: number): DecisionState | undefined {
  return graph.states.get(version);
}

/** Every version from fromVersion through toVersion, inclusive. Real,
 *  general path logic -- it's just that against real data today,
 *  fromVersion and toVersion can currently only both be 0. */
export function getPath(graph: DecisionStateGraph, fromVersion: number, toVersion: number): DecisionState[] {
  if (fromVersion > toVersion) throw new Error("getPath: fromVersion must be <= toVersion");
  const path: DecisionState[] = [];
  for (let v = fromVersion; v <= toVersion; v += 1) {
    const state = graph.states.get(v);
    if (!state) throw new Error(`DecisionStateGraph ${graph.decisionId} has no state at version ${v}`);
    path.push(state);
  }
  return path;
}

/**
 * Appends a new state version, with real integrity checks enforced (not
 * aspirational):
 *   - newState.id must equal the graph's own decisionId (DecisionState.id
 *     is constant across every version of one decision -- see
 *     decision-state.ts).
 *   - newState.version must be exactly the current highest version + 1.
 *   - newState.parentStateId must equal the current state's own
 *     transitionHash. This is a design decision made here, not specified
 *     anywhere before it: since DecisionState.id can't disambiguate which
 *     version is the parent (it's the same id for every version), a
 *     content-addressed pointer -- the parent's transitionHash -- is what
 *     parentStateId means for version > 0.
 *   - newState.transitionHash must equal
 *     computeTransitionHash(current.transitionHash, newState.transition),
 *     the same hash-chaining decision-state.ts already uses for the root.
 *
 * Immutable: returns a new graph, never mutates the one passed in,
 * consistent with Decision State's own frozen immutability invariant
 * (Controller spec v3.0 Section 5.1).
 */
export function appendState(graph: DecisionStateGraph, newState: DecisionState): DecisionStateGraph {
  const current = getCurrentState(graph);

  if (newState.id !== graph.decisionId) {
    throw new Error(`appendState: newState.id (${newState.id}) doesn't match graph.decisionId (${graph.decisionId})`);
  }
  if (newState.version !== current.version + 1) {
    throw new Error(`appendState: expected version ${current.version + 1}, got ${newState.version}`);
  }
  if (newState.parentStateId !== current.transitionHash) {
    throw new Error("appendState: newState.parentStateId must equal the current state's transitionHash");
  }
  const expectedHash = computeTransitionHash(current.transitionHash, newState.transition);
  if (newState.transitionHash !== expectedHash) {
    throw new Error(
      "appendState: newState.transitionHash doesn't match computeTransitionHash(current.transitionHash, newState.transition)",
    );
  }

  const nextStates = new Map(graph.states);
  nextStates.set(newState.version, newState);
  return { decisionId: graph.decisionId, states: nextStates };
}
