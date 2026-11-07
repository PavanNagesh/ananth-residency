import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "../../lib/storage";

/**
 * New-order alert: a two-note chime repeated every few seconds while any order is
 * unacknowledged, plus a browser notification when one arrives (if allowed).
 * Browsers only allow sound after a tap on the page, so `needsTap` tells the UI to ask.
 */
export function useOrderAlert(unacknowledged: number, newestId: number | null) {
  const [soundOn, setSoundOn] = useState(() => storage.get("ar.staff.sound", true));
  const [needsTap, setNeedsTap] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const lastNotified = useRef<number | null>(null);

  const ensureContext = useCallback(async () => {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctxRef.current ??= new Ctor();
    if (ctxRef.current.state === "suspended") {
      try {
        await ctxRef.current.resume();
      } catch {
        /* still locked */
      }
    }
    setNeedsTap(ctxRef.current.state !== "running");
    return ctxRef.current;
  }, []);

  const chime = useCallback(async () => {
    const ctx = await ensureContext();
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    for (const [i, freq] of [880, 1318.5].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.35, t + i * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.22);
      osc.stop(t + i * 0.22 + 0.55);
    }
  }, [ensureContext]);

  // Unlock audio on the first interaction anywhere on the page.
  useEffect(() => {
    const unlock = () => void ensureContext();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    void ensureContext();
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [ensureContext]);

  // Ring while there are unacknowledged orders.
  useEffect(() => {
    if (!soundOn || unacknowledged === 0) return;
    void chime();
    const id = window.setInterval(() => void chime(), 4000);
    return () => window.clearInterval(id);
  }, [soundOn, unacknowledged, chime]);

  // Tab title + system notification for each new arrival.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unacknowledged > 0 ? `(${unacknowledged}) New order · ${base.replace(/^New order · /, "")}` : base.replace(/^New order · /, "");
  }, [unacknowledged]);

  useEffect(() => {
    if (newestId === null) return;
    if (lastNotified.current === null) {
      lastNotified.current = newestId;
      return;
    }
    if (newestId > lastNotified.current) {
      lastNotified.current = newestId;
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        new Notification("New order", { body: "A customer placed an order. Open the dashboard to call them.", tag: "new-order" });
      }
    }
  }, [newestId]);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => {
      storage.set("ar.staff.sound", !v);
      return !v;
    });
    void ensureContext();
  }, [ensureContext]);

  const notificationsAvailable = typeof window !== "undefined" && "Notification" in window;
  const [notifPermission, setNotifPermission] = useState(notificationsAvailable ? Notification.permission : "denied");
  const askNotifications = useCallback(async () => {
    if (!notificationsAvailable) return;
    setNotifPermission(await Notification.requestPermission());
  }, [notificationsAvailable]);

  return { soundOn, toggleSound, needsTap, unlock: ensureContext, testSound: chime, notifPermission, askNotifications, notificationsAvailable };
}
