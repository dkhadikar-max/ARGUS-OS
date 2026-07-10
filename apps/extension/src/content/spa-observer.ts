/**
 * LinkedIn is a single-page app — a content script only runs once per hard
 * navigation, so profile-to-profile clicks never re-trigger it. Bible §16.2
 * mitigation: "DOM mutation observer for SPA navigation" (§18 EXT-1). A
 * content script's `window` is a separate realm from the page's, so we
 * can't intercept the page's own `history.pushState` calls directly —
 * instead we watch the DOM for mutations and diff `location.href` on each
 * one, which reliably catches LinkedIn's client-side route changes.
 */
export function watchForUrlChanges(onChange: (url: string) => void): () => void {
  let lastUrl = window.location.href;

  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      onChange(lastUrl);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
