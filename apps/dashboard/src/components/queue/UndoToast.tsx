"use client";

// Decision Workspace -- small, hand-rolled toast (no new npm dependency,
// matching this app's established pattern of building its own small UI
// primitives). Purely presentational: useUndoableQueueAction.ts owns the
// 5s timer and mounts/unmounts this based on whether an action is
// pending, so this component never manages its own countdown.
export function UndoToast({ message, onUndo }: { message: string; onUndo: () => void }) {
  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-lg bg-navy px-4 py-2.5 text-sm text-white shadow-lg"
    >
      <span>{message}</span>
      <button type="button" onClick={onUndo} className="font-semibold text-teal-glow hover:underline">
        Undo
      </button>
    </div>
  );
}
