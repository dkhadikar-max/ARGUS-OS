import type { ReactNode } from "react";

// Design System Pass (2026-08-01) -- the literal <header className="mb-6">
// + <h1 className="text-lg font-bold text-gray-900"> block was hand-typed
// identically across all of this app's page.tsx files. Formalized here
// rather than left as a copy-pasted string. `description` accepts
// ReactNode, not just string -- billing/page.tsx's description embeds a
// dynamic <span> for the current plan, not plain text. `actions`, when
// given, switches to the flex+sibling-element layout a couple of pages
// need (a range selector, a Slack-connect button) alongside the title --
// branched rather than always wrapping title/description in an extra div,
// so the common no-actions case keeps the exact original DOM shape.
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  if (actions) {
    return (
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        </div>
        {actions}
      </header>
    );
  }

  return (
    <header className="mb-6">
      <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </header>
  );
}
