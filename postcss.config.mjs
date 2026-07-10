// Empty on purpose: Tailwind v4 is wired in via the @tailwindcss/vite plugin
// (see apps/extension/vite.config.ts), which processes CSS directly and
// needs no PostCSS plugins. This file exists solely so postcss-load-config's
// upward directory search resolves here instead of continuing past the
// repo root to an unrelated postcss.config.mjs elsewhere on this machine.
export default {
  plugins: {},
};
