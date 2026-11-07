import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { MenuResponse } from "../../shared/types";
import { api } from "./api";
import { useCart } from "./cart";
import { useToast } from "./toast";
import { useResource } from "./use-resource";

type MenuState = ReturnType<typeof useResource<MenuResponse>>;
const MenuContext = createContext<MenuState | null>(null);

/** Live menu, refreshed every minute so dishes switched off by the kitchen disappear. */
export function MenuProvider({ children }: { children: ReactNode }) {
  const menu = useResource<MenuResponse>("menu", (signal) => api<MenuResponse>("/menu", { signal }), { pollMs: 60_000 });
  const cart = useCart();
  const toast = useToast();
  const { reconcile } = cart;

  useEffect(() => {
    if (!menu.data) return;
    const removed = reconcile(menu.data);
    if (removed.length) {
      toast(`${removed.join(", ")} ${removed.length === 1 ? "is" : "are"} no longer available and ${removed.length === 1 ? "was" : "were"} removed from your cart.`, "danger");
    }
  }, [menu.data, reconcile, toast]);

  return <MenuContext.Provider value={menu}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const m = useContext(MenuContext);
  if (!m) throw new Error("useMenu must be used inside MenuProvider");
  return m;
}
