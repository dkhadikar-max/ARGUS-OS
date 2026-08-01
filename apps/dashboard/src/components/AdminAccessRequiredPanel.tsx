// Rendered when the Admin API returns a real 403 (requireAdmin's email
// allowlist gate) -- an honest, non-security-relevant outcome for a
// signed-in-but-non-admin user, not an error. Distinct from
// app/admin/error.tsx, which only handles genuinely unexpected failures.
export function AdminAccessRequiredPanel() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Design System Pass (2026-08-01) -- border/bg swapped onto the
          caution brand token (same hex as Tailwind's default amber);
          text kept at default Tailwind's amber-800/700 dark shades for
          contrast, since no darker caution shade is defined. */}
      <div className="rounded-lg border border-caution/30 bg-caution/10 p-6 text-center">
        <p className="text-sm font-medium text-amber-800">Admin access required</p>
        <p className="mt-1 text-sm text-amber-700">
          This page is only available to Argus admins. If you believe you should have access, contact your team.
        </p>
      </div>
    </main>
  );
}
