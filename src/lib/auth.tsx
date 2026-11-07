import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Customer } from "../../shared/types";
import { api } from "./api";

type Auth = {
  customer: Customer | null;
  ready: boolean;
  setCustomer: (c: Customer | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ customer: Customer | null }>("/auth/session")
      .then((r) => setCustomer(r.customer))
      .catch((e) => console.warn(e))
      .finally(() => setReady(true));
  }, []);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST", body: {} }).catch(() => {});
    setCustomer(null);
  }, []);

  const value = useMemo(() => ({ customer, ready, setCustomer, signOut }), [customer, ready, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCustomer() {
  const c = useContext(AuthContext);
  if (!c) throw new Error("useCustomer must be used inside CustomerAuthProvider");
  return c;
}
