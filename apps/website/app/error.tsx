"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-obsidian text-pearl flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="font-mono text-4xl font-bold mb-4">Error</h1>
          <p className="text-ash mb-6">{error.message}</p>
          <button
            onClick={reset}
            className="font-mono text-xs font-semibold px-5 py-2.5 bg-amber text-obsidian tracking-[0.05em] uppercase"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}