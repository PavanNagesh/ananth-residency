import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MenuResponse } from "../../shared/types";
import { storage } from "./storage";

export type CartLine = {
  key: string;
  itemId: number;
  variantId: number | null;
  name: string;
  variantName: string | null;
  unitPricePaise: number;
  qty: number;
};

type Cart = {
  lines: CartLine[];
  note: string;
  count: number;
  subtotalPaise: number;
  add: (line: Omit<CartLine, "key" | "qty">, qty?: number) => void;
  setQty: (key: string, qty: number) => void;
  qtyOfItem: (itemId: number) => number;
  setNote: (note: string) => void;
  clear: () => void;
  /** Drops lines no longer on the menu and refreshes prices. Returns names removed. */
  reconcile: (menu: MenuResponse) => string[];
};

const KEY = "ar.cart.v1";
const CartContext = createContext<Cart | null>(null);
const keyOf = (itemId: number, variantId: number | null) => `${itemId}:${variantId ?? 0}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => storage.get<CartLine[]>(KEY, []));
  const [note, setNote] = useState(() => storage.get<string>(`${KEY}.note`, ""));

  useEffect(() => storage.set(KEY, lines), [lines]);
  useEffect(() => storage.set(`${KEY}.note`, note), [note]);

  const add = useCallback((line: Omit<CartLine, "key" | "qty">, qty = 1) => {
    const key = keyOf(line.itemId, line.variantId);
    setLines((ls) => {
      const found = ls.find((l) => l.key === key);
      if (found) return ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, l.qty + qty) } : l));
      return [...ls, { ...line, key, qty }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, qty) } : l))));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setNote("");
  }, []);

  const linesRef = useRef(lines);
  linesRef.current = lines;

  const reconcile = useCallback((menu: MenuResponse) => {
    const items = new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
    const current = linesRef.current;
    const removed: string[] = [];
    const next: CartLine[] = [];
    for (const l of current) {
      const item = items.get(l.itemId);
      const variant = l.variantId === null ? null : item?.variants.find((v) => v.id === l.variantId);
      const valid = item && (l.variantId === null ? item.variants.length === 0 : Boolean(variant));
      if (!valid) {
        removed.push(l.variantName ? `${l.name} (${l.variantName})` : l.name);
        continue;
      }
      next.push({ ...l, name: item.name, unitPricePaise: variant ? variant.pricePaise : item.pricePaise });
    }
    const changed =
      next.length !== current.length || next.some((l, i) => l.unitPricePaise !== current[i]?.unitPricePaise || l.name !== current[i]?.name);
    if (changed) setLines(next);
    return removed;
  }, []);

  const value = useMemo<Cart>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotalPaise = lines.reduce((n, l) => n + l.qty * l.unitPricePaise, 0);
    return {
      lines,
      note,
      count,
      subtotalPaise,
      add,
      setQty,
      setNote,
      clear,
      reconcile,
      qtyOfItem: (itemId) => lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0),
    };
  }, [lines, note, add, setQty, clear, reconcile]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const c = useContext(CartContext);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}
