"use client";

import { useEffect } from "react";

export default function QueueError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-800">Couldn&apos;t load your queue</p>
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
