import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

export type LayoutReport = {
  viewport: string;
  coarsePointer: boolean;
  horizontalScroll: boolean;
  offscreen: string[];
  tinyTargets: string[];
  smallTouchTargets: string[];
  zoomingInputs: string[];
};

/**
 * Measures the page as a person would experience it on this device:
 * sideways scrolling, content cut off at the edge, tap targets, and inputs that make
 * iOS Safari zoom in on focus (font-size under 16px).
 */
export async function measureLayout(page: Page): Promise<LayoutReport> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const modal = document.querySelector("dialog[open]");
    const scope: ParentNode = modal ?? document;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== "hidden" &&
        s.display !== "none" &&
        !el.closest("[aria-hidden=true]") &&
        !el.closest(".sr-only") &&
        !el.classList.contains("sr-only-focusable")
      );
    };
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const label = (el: Element) =>
      (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);

    const offscreen = [...scope.querySelectorAll("*")]
      .filter((el) => visible(el) && !inScroller(el) && getComputedStyle(el).position !== "fixed")
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.right > vw + 1 || r.left < -1;
      })
      .slice(0, 8)
      .map((el) => `${el.tagName.toLowerCase()} "${label(el)}" (${Math.round(el.getBoundingClientRect().left)}–${Math.round(el.getBoundingClientRect().right)} of ${vw})`);

    const targets = [...scope.querySelectorAll("button, a[href], input, select, textarea, summary, [role=switch], [role=tab]")]
      .filter((el) => visible(el) && !(el.tagName === "A" && el.closest("p")) && (el as HTMLInputElement).type !== "hidden")
      // Elements scrolled out of a horizontal row are still real targets: measure them all.
      .map((el) => {
        const r = el.getBoundingClientRect();
        // Switches carry an invisible 8px hit area on every side (::before).
        const pad = el.getAttribute("role") === "switch" ? 16 : 0;
        // Native checkboxes and radios sit inside a full-row label, which is the real target.
        const row = (el as HTMLInputElement).type === "checkbox" || (el as HTMLInputElement).type === "radio" ? el.closest("label") : null;
        const rr = row ? row.getBoundingClientRect() : r;
        return { el, w: Math.max(r.width + pad, rr.width), h: Math.max(r.height + pad, rr.height) };
      });
    const fmt = (t: { el: Element; w: number; h: number }) => `${label(t.el)} ${Math.round(t.w)}×${Math.round(t.h)}`;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const zoomingInputs = [...scope.querySelectorAll("input:not([type=checkbox]):not([type=radio]), select, textarea")]
      .filter((el) => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${label(el)} ${getComputedStyle(el).fontSize}`);

    return {
      viewport: `${vw}×${innerHeight}`,
      coarsePointer: coarse,
      horizontalScroll: document.documentElement.scrollWidth > vw + 1,
      offscreen,
      tinyTargets: [...new Set(targets.filter((t) => t.w < 24 || t.h < 24).map(fmt))],
      smallTouchTargets: [...new Set(targets.filter((t) => t.w < 40 || t.h < 40).map(fmt))],
      zoomingInputs,
    };
  });
}

/** Asserts the layout rules for this device and saves a screenshot for visual review. */
export async function checkScreen(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(250); // let sheet animations settle
  const r = await measureLayout(page);
  const touch = Boolean(info.project.use.hasTouch);
  await page.screenshot({ path: info.outputPath(`${name}.png`) });
  info.annotations.push({ type: name, description: JSON.stringify({ viewport: r.viewport, coarse: r.coarsePointer, small: r.smallTouchTargets.length }) });

  expect.soft(r.horizontalScroll, `${name}: page scrolls sideways`).toBe(false);
  expect.soft(r.offscreen, `${name}: content cut off at the screen edge`).toEqual([]);
  expect.soft(r.tinyTargets, `${name}: tap targets under 24px (WCAG 2.5.8)`).toEqual([]);
  if (touch) {
    expect.soft(r.smallTouchTargets, `${name}: tap targets under 40px on a touch screen`).toEqual([]);
    expect.soft(r.zoomingInputs, `${name}: inputs under 16px make iOS zoom in`).toEqual([]);
  }
  return r;
}

/** Tap on touch devices, click elsewhere: exercises the real input path. */
export async function press(locator: Locator, info: TestInfo) {
  if (info.project.use.hasTouch) await locator.tap();
  else await locator.click();
}

/** Fails the test on uncaught errors or console errors (unsupported browser features show up here). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Expected API responses the UI handles (e.g. 401 before signing in).
    if (/Failed to load resource: the server responded with a status of (401|403|404|409|422)/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** A stable, valid Indian mobile number per device project, so each device signs in as its own customer. */
export function phoneFor(projectName: string) {
  let h = 0;
  for (const ch of projectName) h = (h * 31 + ch.charCodeAt(0)) % 1_000_000_000;
  return `9${String(h).padStart(9, "0")}`;
}
