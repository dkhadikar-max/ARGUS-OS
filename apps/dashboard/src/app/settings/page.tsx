import { api } from "../../lib/api-client";
import { IcpCriteriaEditor } from "../../components/IcpCriteriaEditor";
import { PolicyRulesEditor } from "../../components/PolicyRulesEditor";
import { updatePreferencesAction } from "./actions";

// Bible §18 DSH-5 "Settings" (P1 items only -- "Integration connections" and
// "Billing page (Stripe)" are P2 and out of scope here; Slack connect
// already lives on the Queue page's "Connect Slack" button).
export default async function SettingsPage() {
  const [preferences, icp, policy] = await Promise.all([
    api.getPreferences(),
    api.getIcp(),
    // ARGUS Unanimous Policy v2.1 "L4 Policy Engine" -- not the Bible, see
    // packages/shared/schemas/policy.ts.
    api.getPolicy(),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-bold text-gray-900">Settings</h1>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Preferences
        </h2>
        <form action={updatePreferencesAction} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="text-sm text-gray-700">
              Message tone
              <select
                name="messageTone"
                defaultValue={preferences.messageTone}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="bold">Bold</option>
                <option value="friendly">Friendly</option>
              </select>
            </label>

            <label className="text-sm text-gray-700">
              Message length
              <select
                name="messageLength"
                defaultValue={preferences.messageLength}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>

            <label className="text-sm text-gray-700">
              Sidebar position
              <select
                name="sidebarPosition"
                defaultValue={preferences.sidebarPosition}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>

            <label className="text-sm text-gray-700">
              Default channel
              <select
                name="defaultChannel"
                defaultValue={preferences.defaultChannel}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="LINKEDIN">LinkedIn</option>
                <option value="EMAIL">Email</option>
                <option value="SLACK">Slack</option>
                <option value="OTHER">Other</option>
              </select>
            </label>

            <label className="text-sm text-gray-700">
              Outcome digest
              <select
                name="digestFrequency"
                defaultValue={preferences.digestFrequency}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="never">Never</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </label>

            <label className="flex items-center gap-2 self-end text-sm text-gray-700">
              <input type="checkbox" name="autoVerdict" defaultChecked={preferences.autoVerdict} />
              Auto-deliver verdict without click
            </label>
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save preferences
          </button>
          {preferences.updatedAt === null && (
            <p className="text-xs text-gray-400">Showing defaults — not saved yet.</p>
          )}
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Team ICP
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <IcpCriteriaEditor initialCriteria={icp.criteria} />
          {icp.updatedAt === null && (
            <p className="mt-3 text-xs text-gray-400">No ICP saved yet for this team.</p>
          )}
        </div>
      </section>

      {/* Fully functional (ARGUS Unanimous Policy v2.1 "L4 Policy Engine"),
          but collapsed by default rather than marked "Coming soon" -- it
          works today, so hiding it behind a disclosure is honest scope
          control; claiming it's unbuilt would not be. */}
      <details className="mt-8 group">
        <summary className="mb-3 cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500 group-open:mb-3">
          Advanced settings
        </summary>
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Policy Engine
          </h2>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <PolicyRulesEditor initialRules={policy.rules} />
            {policy.updatedAt === null && (
              <p className="mt-3 text-xs text-gray-400">No policy rules configured yet for this team.</p>
            )}
          </div>
        </section>
      </details>
    </main>
  );
}
