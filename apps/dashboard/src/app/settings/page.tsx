import { api } from "../../lib/api-client";
import { IcpCriteriaEditor } from "../../components/IcpCriteriaEditor";
import { PolicyRulesEditor } from "../../components/PolicyRulesEditor";
import { CompanyContextEditor } from "../../components/CompanyContextEditor";
import { PageHeader } from "../../components/ui/PageHeader";
import { updatePreferencesAction } from "./actions";

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Bible §18 DSH-5 "Settings" (P1 items only -- "Integration connections" and
// "Billing page (Stripe)" are P2 and out of scope here; Slack connect
// already lives on the Queue page's "Connect Slack" button).
//
// Complete the Redesign (2026-08-02) -- "zero-form": all 4 sections are now
// closed-by-default click-to-expand panels, reusing the exact native
// <details>/<summary> disclosure this page already used for the old
// "Advanced settings" wrapper (now removed as a special case -- Policy
// Engine is just the 4th panel, no double-nesting). Each collapsed
// summary shows a real one-line status computed from already-fetched
// data, no new fetch. The editors themselves (CompanyContextEditor,
// IcpCriteriaEditor, PolicyRulesEditor) and the Preferences <form> are
// untouched -- same props, same Save button names, same Server Action
// call signatures their own tests assert on; only this page's wrapping
// structure changed.
export default async function SettingsPage() {
  const [preferences, icp, policy, team] = await Promise.all([
    api.getPreferences(),
    api.getIcp(),
    // ARGUS Unanimous Policy v2.1 "L4 Policy Engine" -- not the Bible, see
    // packages/shared/schemas/policy.ts.
    api.getPolicy(),
    api.getTeam(),
  ]);

  const preferencesSummary = preferences.updatedAt === null
    ? "Showing defaults — not saved yet"
    : `${preferences.messageTone} tone · ${preferences.messageLength} length · ${preferences.defaultChannel.toLowerCase()} channel`;

  const companyContextSummary = team.companyContext ? truncate(team.companyContext, 60) : "Not set";

  const icpSummary = icp.updatedAt === null
    ? "No ICP saved yet"
    : `${icp.criteria.length} criteri${icp.criteria.length === 1 ? "on" : "a"}`;

  const policySummary = policy.updatedAt === null
    ? "No rules configured yet"
    : `${policy.rules.length} rule${policy.rules.length === 1 ? "" : "s"}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader title="Settings" />

      <div className="space-y-3">
        <details className="group rounded-lg border border-gray-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Preferences</span>
            <span className="text-xs text-gray-500 group-open:hidden">{preferencesSummary}</span>
          </summary>
          <form
            action={updatePreferencesAction}
            className="space-y-4 border-t border-gray-100 p-4"
          >
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
              className="rounded bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              Save preferences
            </button>
            {preferences.updatedAt === null && (
              <p className="text-xs text-gray-400">Showing defaults — not saved yet.</p>
            )}
          </form>
        </details>

        <details className="group rounded-lg border border-gray-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Company context</span>
            <span className="max-w-[60%] truncate text-xs text-gray-500 group-open:hidden">{companyContextSummary}</span>
          </summary>
          <div className="border-t border-gray-100 p-4">
            <CompanyContextEditor initialCompanyContext={team.companyContext} />
          </div>
        </details>

        <details className="group rounded-lg border border-gray-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Team ICP</span>
            <span className="text-xs text-gray-500 group-open:hidden">{icpSummary}</span>
          </summary>
          <div className="border-t border-gray-100 p-4">
            <IcpCriteriaEditor initialCriteria={icp.criteria} />
            {icp.updatedAt === null && (
              <p className="mt-3 text-xs text-gray-400">No ICP saved yet for this team.</p>
            )}
          </div>
        </details>

        {/* Fully functional (ARGUS Unanimous Policy v2.1 "L4 Policy Engine"),
            same closed-by-default disclosure treatment as the other 3
            panels now -- no longer a special-cased nested wrapper. */}
        <details className="group rounded-lg border border-gray-200 bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Policy Engine</span>
            <span className="text-xs text-gray-500 group-open:hidden">{policySummary}</span>
          </summary>
          <div className="border-t border-gray-100 p-4">
            <PolicyRulesEditor initialRules={policy.rules} />
            {policy.updatedAt === null && (
              <p className="mt-3 text-xs text-gray-400">No policy rules configured yet for this team.</p>
            )}
          </div>
        </details>
      </div>
    </main>
  );
}
