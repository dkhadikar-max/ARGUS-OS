// Local (not the repo-root stub) so Next.js's PostCSS pipeline actually
// runs Tailwind v4 — see apps/extension's identical note for why an empty
// root config exists at all.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
