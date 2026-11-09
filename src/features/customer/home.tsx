import { useEffect, useMemo, useRef, useState } from "react";
import { formatRupees } from "../../../shared/bill";
import { formatPhone } from "../../../shared/phone";
import type { MenuCategory, MenuItem, MenuResponse } from "../../../shared/types";
import { buttonClasses } from "../../components/ui/button-classes";
import { cn } from "../../components/ui/cn";
import { controlClasses } from "../../components/ui/field";
import { Icon } from "../../components/ui/icons";
import { Button, Dialog, ErrorBlock, LoadingBlock, Notice, QtyStepper, VegMark } from "../../components/ui/primitives";
import { InstallBanner } from "../../components/install-app";
import { useCart } from "../../lib/cart";
import { useMenu } from "../../lib/menu";
import { useToast } from "../../lib/toast";
import { CartContents, MobileCartBar } from "./cart";

export function HomePage() {
  const menu = useMenu();
  const data = menu.data;

  return (
    <>
      <Hero data={data} />
      <main id="main" className="relative rounded-t-lg bg-paper pb-28 lg:pb-12">
        {menu.loading && !data ? (
          <div className="wrap">
            <LoadingBlock label="Loading the menu" />
          </div>
        ) : menu.error && !data ? (
          <div className="wrap py-8">
            <ErrorBlock message={menu.error} onRetry={() => void menu.reload()} />
          </div>
        ) : data ? (
          <MenuBody data={data} />
        ) : null}
      </main>
      <MobileCartBar />
    </>
  );
}

function Hero({ data }: { data?: MenuResponse }) {
  const r = data?.restaurant;
  const threshold = data ? formatRupees(data.pricing.freeDeliveryThresholdPaise) : "₹500";
  return (
    <section aria-labelledby="hero-title" className="wrap pt-2 pb-6 sm:pt-6 sm:pb-10 lg:pt-8 lg:pb-12 short:pt-1 short:pb-4">
      <h1 id="hero-title" className="m-0 max-w-[15ch] font-display text-hero font-semibold text-on-brand md:max-w-[22ch] short:max-w-none short:text-[1.75rem]">
        Pure vegetarian. Delivered from our kitchen.
      </h1>
      <p className="mt-3 mb-0 max-w-measure text-body text-on-brand-2 sm:mt-4 sm:text-lead short:hidden">
        <span className="max-sm:hidden">Order from the Ananth Residency kitchen on Station Road, Hubballi. </span>
        Free delivery on orders of {threshold} and above.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-6 sm:gap-3 short:mt-3">
        {r && (
          <p className="m-0 inline-flex min-h-11 items-center gap-2.5 rounded-sm bg-black/25 px-3.5 text-small font-semibold text-on-brand">
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-pill", r.acceptingOrders ? "bg-[oklch(0.78_0.16_145)]" : "bg-[oklch(0.8_0.14_70)]")}
            />
            {r.acceptingOrders ? (
              <>
                <span className="sm:hidden">Open · about {r.prepTimeMinutes} min</span>
                <span className="max-sm:hidden">Taking orders · ready in about {r.prepTimeMinutes} min</span>
              </>
            ) : (
              "Not taking orders right now"
            )}
          </p>
        )}
        {r && (
          <a href={`tel:${r.phone}`} className={buttonClasses("on-brand", "md")} aria-label={`Call ${formatPhone(r.phone)}`}>
            <Icon name="phone" size={18} />
            <span className="sm:hidden">Call</span>
            <span className="max-sm:hidden">Call {formatPhone(r.phone)}</span>
          </a>
        )}
      </div>
    </section>
  );
}

function MenuBody({ data }: { data: MenuResponse }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const categories = useMemo(() => {
    if (!q) return data.categories;
    return data.categories
      .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)) }))
      .filter((c) => c.items.length > 0);
  }, [data.categories, q]);
  const matchCount = categories.reduce((n, c) => n + c.items.length, 0);
  const searchRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLElement>(null);
  const active = useScrollSpy(categories.map((c) => `cat-${c.id}`), chipsRef);

  return (
    <>
      <div className="wrap grid gap-3 pt-5 sm:pt-6">
        {!data.restaurant.acceptingOrders && (
          <Notice tone="warn" title="We are not taking delivery orders right now.">
            {data.restaurant.pausedMessage} You can still browse the menu.
          </Notice>
        )}
        <InstallBanner className="sm:hidden" />
        {data.announcements.map((a) => (
          <Notice key={a.id} tone={a.kind === "alert" ? "warn" : a.kind === "offer" ? "ok" : "info"}>
            <span className="text-ink">{a.text}</span>
          </Notice>
        ))}
        <div className="relative lg:max-w-[calc(100%-24rem)]">
          <label htmlFor="menu-search" className="sr-only">
            Search the menu
          </label>
          <Icon name="search" size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            id="menu-search"
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Search dishes, like paneer or naan"
            className={cn(controlClasses, "pl-10")}
            autoComplete="off"
          />
        </div>
      </div>

      {/* Pinned category row. Search scrolls away on small screens; the icon jumps back to it. */}
      <div className="sticky top-0 z-20 mt-3 border-b border-line bg-paper/95">
        <div className="wrap flex items-center gap-1.5 py-2">
          <button
            type="button"
            aria-label="Search the menu"
            onClick={() => {
              const el = searchRef.current;
              if (!el) return;
              el.scrollIntoView({ block: "center", behavior: "smooth" });
              el.focus({ preventScroll: true });
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-paper-raised text-ink-2 hover:text-ink pointer-fine:size-9"
          >
            <Icon name="search" size={18} />
          </button>
          <nav ref={chipsRef} aria-label="Menu categories" className="no-scrollbar -my-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 pr-1">
            {categories.map((c) => (
              <a
                key={c.id}
                href={`#cat-${c.id}`}
                data-cat={`cat-${c.id}`}
                aria-current={active === `cat-${c.id}` ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center rounded-pill border px-4 text-small font-semibold whitespace-nowrap no-underline transition-colors duration-(--dur-quick) pointer-fine:min-h-9 pointer-fine:px-3.5",
                  active === `cat-${c.id}`
                    ? "border-brand bg-brand text-on-brand"
                    : "border-line bg-paper-raised text-ink-2 hover:border-line-strong hover:text-ink",
                )}
              >
                {c.name}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div className="wrap grid gap-8 pt-2 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          {q && (
            <p role="status" className="mt-4 mb-0 text-small text-ink-2">
              {matchCount === 0 ? `No dishes match "${query.trim()}". Try another word.` : `${matchCount} ${matchCount === 1 ? "dish matches" : "dishes match"} "${query.trim()}".`}
            </p>
          )}
          {categories.map((c) => (
            <CategorySection key={c.id} category={c} />
          ))}
        </div>
        <aside aria-label="Your order" className="hidden lg:block">
          <div className="sticky top-20 mt-6 max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-contain rounded-md border border-line bg-paper-raised p-5">
            <h2 className="m-0 mb-4 font-display text-title font-semibold">Your order</h2>
            <CartContents />
          </div>
        </aside>
      </div>
    </>
  );
}

function CategorySection({ category }: { category: MenuCategory }) {
  return (
    <section id={`cat-${category.id}`} aria-labelledby={`cat-${category.id}-title`} className="scroll-mt-20 pt-6 sm:pt-8">
      <div className="mb-2 flex items-baseline justify-between gap-4 border-b border-line pb-2">
        <h2 id={`cat-${category.id}-title`} className="m-0 font-display text-display font-semibold">
          {category.name}
        </h2>
        <span className="num shrink-0 text-small text-ink-3">{category.items.length}</span>
      </div>
      {category.note && <p className="mt-0 mb-2 text-small text-ink-2">{category.note}</p>}
      <ul className="m-0 list-none divide-y divide-line p-0">
        {category.items.map((item) => (
          <MenuItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function MenuItemRow({ item }: { item: MenuItem }) {
  const cart = useCart();
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const hasOptions = item.variants.length > 0;
  const key = `${item.id}:0`;
  const line = cart.lines.find((l) => l.key === key);
  const inCart = cart.qtyOfItem(item.id);

  return (
    <li className="flex items-center gap-3 py-3.5">
      <VegMark className="self-start mt-1" />
      <div className="min-w-0 flex-1">
        <h3 className="m-0 text-body leading-snug font-semibold">{item.name}</h3>
        {item.description && <p className="m-0 text-small text-ink-2">{item.description}</p>}
        <p className="num m-0 mt-0.5 text-small font-semibold text-ink-2">
          {hasOptions && <span className="font-normal">from </span>}
          {formatRupees(item.pricePaise)}
          {hasOptions && inCart > 0 && <span className="ml-2 font-normal text-accent-text">{inCart} in cart</span>}
        </p>
      </div>
      {!hasOptions && line ? (
        <QtyStepper qty={line.qty} name={item.name} onChange={(q) => cart.setQty(key, q)} />
      ) : (
        <Button
          variant="secondary"
          size="sm"
          icon="plus"
          aria-label={`Add ${item.name}`}
          onClick={() => {
            if (hasOptions) return setPicking(true);
            cart.add({ itemId: item.id, variantId: null, name: item.name, variantName: null, unitPricePaise: item.pricePaise });
            toast(`${item.name} added.`, "ok");
          }}
        >
          Add
        </Button>
      )}
      {hasOptions && <OptionPicker item={item} open={picking} onClose={() => setPicking(false)} />}
    </li>
  );
}

function OptionPicker({ item, open, onClose }: { item: MenuItem; open: boolean; onClose: () => void }) {
  const cart = useCart();
  const toast = useToast();
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? 0);
  const [qty, setQty] = useState(1);
  const variant = item.variants.find((v) => v.id === variantId) ?? item.variants[0];

  useEffect(() => {
    if (open) {
      setVariantId(item.variants[0]?.id ?? 0);
      setQty(1);
    }
  }, [open, item.variants]);

  if (!variant) return null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex items-center justify-between gap-3">
          <QtyStepper qty={qty} name={item.name} min={1} onChange={(q) => setQty(Math.max(1, q))} />
          <Button
            variant="accent"
            size="lg"
            className="flex-1"
            onClick={() => {
              cart.add(
                { itemId: item.id, variantId: variant.id, name: item.name, variantName: variant.name, unitPricePaise: variant.pricePaise },
                qty,
              );
              toast(`${item.name} (${variant.name}) added.`, "ok");
              onClose();
            }}
          >
            Add · <span className="num">{formatRupees(variant.pricePaise * qty)}</span>
          </Button>
        </div>
      }
    >
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 text-small font-semibold text-ink-2">Choose one</legend>
        {item.variants.map((v) => (
          <label
            key={v.id}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-sm border px-4 py-2.5",
              v.id === variant.id ? "border-brand bg-paper-sunken" : "border-line hover:border-line-strong",
            )}
          >
            <span className="inline-flex items-center gap-3">
              <input
                type="radio"
                name={`variant-${item.id}`}
                value={v.id}
                checked={v.id === variant.id}
                onChange={() => setVariantId(v.id)}
                className="size-4 accent-[var(--brand)]"
              />
              <span className="font-medium">{v.name}</span>
            </span>
            <span className="num text-small font-semibold">{formatRupees(v.pricePaise)}</span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/** Highlights the category chip for the section near the top, and slides that chip into view. */
function useScrollSpy(ids: string[], scroller: React.RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  const key = ids.join(",");
  const visible = useRef(new Map<string, boolean>());

  useEffect(() => {
    const els = key ? key.split(",").map((id) => document.getElementById(id)).filter((e): e is HTMLElement => e !== null) : [];
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    visible.current.clear();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.current.set(e.target.id, e.isIntersecting);
        const first = els.find((el) => visible.current.get(el.id));
        if (first) setActive(first.id);
      },
      // Below the pinned category row, top 45% of the screen.
      { rootMargin: "-72px 0px -55% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);

  // Scroll only the chip row (never the page), so the page does not jump.
  useEffect(() => {
    const row = scroller.current;
    if (!active || !row) return;
    const chip = row.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (!chip) return;
    const left = chip.offsetLeft - row.offsetLeft;
    const target = left - (row.clientWidth - chip.offsetWidth) / 2;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    row.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [active, scroller]);

  return active;
}
