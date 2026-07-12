/** Lowercases, replaces runs of non-alphanumerics with a single dash, trims
 *  any leading/trailing dash, and caps length -- shared by every place that
 *  turns free text into a stable id/slug (team slugs, Company Memory risk
 *  flag ids), so both get the same dash-trimming/length-cap protection. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}
