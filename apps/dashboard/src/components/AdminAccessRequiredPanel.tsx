// Rendered when the Admin API returns a real 403 (requireAdmin's email
// allowlist gate) -- an honest, non-security-relevant outcome for a
// signed-in-but-non-admin user, not an error. Distinct from
// app/admin/error.tsx, which only handles genuinely unexpected failures.
export function AdminAccessRequiredPanel() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="text-sm font-medium text-amber-800">Admin access required</p>
        <p className="mt-1 text-sm text-amber-700">
          This page is only available to Argus admins. If you believe you should have access, contact your team.
        </p>
      </div>
    </main>
  );
}
