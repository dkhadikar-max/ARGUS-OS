"use client";

import { useEffect } from "react";

// Mirrors app/queue/error.tsx's generic boundary shape -- /admin had none
// before this increment. Only reached for a genuine unexpected failure
// (401/network/5xx); a real 403 from requireAdmin never reaches here --
// pages under /admin catch that themselves via isForbiddenError and render
// an inline "Admin access required" panel instead, so it's never mislabeled
// as this generic error.
export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">Something went wrong loading this admin page</p>
        <p className="mt-1 text-sm text-red-600">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
