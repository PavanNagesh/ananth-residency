import { useEffect, useState } from "react";

/**
 * "Add to home screen" support.
 * Android Chrome, Samsung Internet and desktop Chrome/Edge fire `beforeinstallprompt`;
 * we keep it and show our own button. iPhone/iPad Safari has no prompt, so we show steps.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  const standalone = installed || isStandalone();
  const ios = isIOS();
  return {
    /** Already opened from the home screen: nothing to offer. */
    standalone,
    /** The browser can show its own install dialog. */
    canPrompt: !standalone && deferred !== null,
    /** iPhone/iPad Safari: show the Share → Add to Home Screen steps. */
    needsIOSSteps: !standalone && deferred === null && ios,
    async prompt() {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      notify();
      return outcome === "accepted";
    },
  };
}

/** Point the page at a different web app manifest (the staff dashboard installs as its own app). */
export function useManifest(href: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const previous = link.getAttribute("href");
    link.setAttribute("href", href);
    return () => {
      if (previous) link.setAttribute("href", previous);
    };
  }, [href]);
}
