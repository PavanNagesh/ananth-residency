/* Ananth Residency service worker.
 * - Pages: network first, so customers always get the latest menu app; the last good copy
 *   opens when the connection drops (the app then shows its own "you seem to be offline" notes).
 * - /assets/* (file names contain a content hash): cache first, they never change.
 * - Photos, icons, fonts: served from cache and refreshed in the background.
 * - /api/* and other sites (Razorpay, Firebase): never cached, always live.
 */
const VERSION = "v3";
const SHELL_CACHE = `ar-shell-${VERSION}`;
const ASSET_CACHE = `ar-assets-${VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/staff.webmanifest", "/favicon.svg", "/brand/hero.jpg", "/brand/icon-192.png"];

/** Files the current build needs to start: scripts and styles named in the page, fonts named in the styles. */
async function buildAssets() {
  const html = await (await fetch("/", { cache: "reload" })).text();
  const fromHtml = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const fromCss = [];
  for (const css of fromHtml.filter((u) => u.endsWith(".css"))) {
    const text = await (await fetch(css)).text();
    for (const m of text.matchAll(/url\(\s*["']?(\/assets\/[^"')]+)["']?\s*\)/g)) {
      // Only the font files the menu uses; other language subsets would just cost data.
      if (!/vietnamese|latin-ext|cyrillic|greek/.test(m[1])) fromCss.push(m[1]);
    }
  }
  return [...new Set([...fromHtml, ...fromCss])];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await (await caches.open(SHELL_CACHE)).addAll(SHELL);
      try {
        await (await caches.open(ASSET_CACHE)).addAll(await buildAssets());
      } catch {
        /* the page still works online; assets get cached as they load */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // App pages (the single-page app shell for every route).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", { ignoreVary: true }).then((r) => r || Response.error())),
    );
    return;
  }

  // Hashed build files: cache first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then(async (c) => {
                await c.put(req, copy);
                // Old builds' files pile up after each deploy: keep the newest 80.
                const keys = await c.keys();
                for (const k of keys.slice(0, Math.max(0, keys.length - 80))) await c.delete(k);
              });
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Everything else from this site (photos, icons, manifests): stale while revalidate.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || network;
    }),
  );
});
