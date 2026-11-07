import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import type { Settings, StaffUser } from "../../../shared/types";
import { Wordmark } from "../../components/brand";
import { cn } from "../../components/ui/cn";
import { TextField } from "../../components/ui/field";
import { Icon, type IconName } from "../../components/ui/icons";
import { Button, LoadingBlock, Switch } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { AnnouncementsPage } from "./announcements";
import { MenuManager } from "./menu";
import { OrdersBoard } from "./orders";
import { PresetsPage } from "./presets";
import { SettingsPage, TeamPage } from "./settings";

type StaffCtx = {
  user: StaffUser;
  settings: Settings | null;
  setSettings: (s: Settings) => void;
  signOut: () => Promise<void>;
};
const Ctx = createContext<StaffCtx | null>(null);
export const useStaff = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStaff outside StaffApp");
  return c;
};

const TITLES: Record<string, string> = {
  "": "Orders",
  menu: "Menu",
  presets: "Presets",
  announcements: "Announcements",
  settings: "Settings",
  team: "Team",
};

export default function StaffApp() {
  const [user, setUser] = useState<StaffUser | null | undefined>(undefined);
  const [settings, setSettings] = useState<Settings | null>(null);
  const location = useLocation();

  useEffect(() => {
    api<{ staff: StaffUser }>("/staff/me")
      .then((r) => setUser(r.staff))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    api<{ settings: Settings }>("/staff/settings")
      .then((r) => setSettings(r.settings))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const seg = location.pathname.replace(/^\/staff\/?/, "").split("/")[0] ?? "";
    if (!document.title.startsWith("(")) document.title = `${TITLES[seg] ?? "Dashboard"} · Ananth Residency staff`;
  }, [location.pathname]);

  const signOut = useCallback(async () => {
    await api("/staff/logout", { body: {} }).catch(() => {});
    setUser(null);
  }, []);

  if (user === undefined) {
    return (
      <div className="min-h-dvh bg-paper">
        <LoadingBlock label="Opening the dashboard" />
      </div>
    );
  }

  if (user === null) {
    return (
      <Routes>
        <Route path="login" element={<StaffLogin onSignedIn={setUser} />} />
        <Route path="*" element={<Navigate to="/staff/login" replace />} />
      </Routes>
    );
  }

  return (
    <Ctx.Provider value={{ user, settings, setSettings, signOut }}>
      <StaffShell>
        <Routes>
          <Route index element={<OrdersBoard />} />
          <Route path="menu" element={<MenuManager />} />
          <Route path="presets" element={<PresetsPage />} />
          <Route path="announcements" element={<AnnouncementsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="team" element={user.role === "owner" ? <TeamPage /> : <Navigate to="/staff" replace />} />
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </StaffShell>
    </Ctx.Provider>
  );
}

const NAV: { to: string; label: string; icon: IconName; owner?: boolean }[] = [
  { to: "/staff", label: "Orders", icon: "receipt" },
  { to: "/staff/menu", label: "Menu", icon: "utensils" },
  { to: "/staff/presets", label: "Presets", icon: "layers" },
  { to: "/staff/announcements", label: "Announcements", icon: "megaphone" },
  { to: "/staff/settings", label: "Settings", icon: "settings" },
  { to: "/staff/team", label: "Team", icon: "users", owner: true },
];

function StaffShell({ children }: { children: ReactNode }) {
  const { user, settings, setSettings, signOut } = useStaff();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggleAccepting(next: boolean) {
    if (!next && !window.confirm("Pause new orders? Customers can still browse the menu but cannot check out.")) return;
    setBusy(true);
    try {
      const r = await api<{ settings: Settings }>("/staff/settings/accepting", { method: "PUT", body: { acceptingOrders: next } });
      setSettings(r.settings);
      toast(next ? "Taking orders again." : "New orders paused.", "ok");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-paper">
      <a href="#main" className="sr-only-focusable rounded-sm bg-accent px-4 py-3 font-semibold text-on-accent">
        Skip to content
      </a>
      <header className="bg-brand-deep text-on-brand">
        <div className="wrap flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <Wordmark to="/staff" size="sm" suffix="Staff" />
          <div className="flex flex-wrap items-center gap-3">
            {settings && (
              <div
                className={cn(
                  "flex items-center gap-3 rounded-sm px-3 py-1.5",
                  settings.acceptingOrders ? "bg-white/8" : "bg-[oklch(0.83_0.125_82)] text-on-accent",
                )}
              >
                <Switch
                  checked={settings.acceptingOrders}
                  onChange={(v) => void toggleAccepting(v)}
                  label={settings.acceptingOrders ? "Taking orders" : "Orders paused"}
                  busy={busy}
                  className="[&_span]:text-inherit"
                />
              </div>
            )}
            <span className="text-small text-on-brand-2 max-sm:hidden">
              {user.name} · {user.role === "owner" ? "Owner" : "Staff"}
            </span>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex min-h-11 items-center gap-2 rounded-sm px-3 text-small font-semibold text-on-brand hover:bg-white/8"
            >
              <Icon name="logout" size={18} />
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Dashboard" className="wrap no-scrollbar flex gap-1 overflow-x-auto">
          {NAV.filter((n) => !n.owner || user.role === "owner").map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/staff"}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-small font-semibold whitespace-nowrap no-underline",
                  isActive ? "border-gold text-on-brand" : "border-transparent text-on-brand-2 hover:text-on-brand",
                )
              }
            >
              <Icon name={n.icon} size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main" className="wrap py-6">
        {children}
      </main>
    </div>
  );
}

function StaffLogin({ onSignedIn }: { onSignedIn: (u: StaffUser) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Staff sign in · Ananth Residency";
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const r = await api<{ staff: StaffUser }>("/staff/login", { body: { identifier, password } });
      onSignedIn(r.staff);
      navigate("/staff", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.fields);
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="app-backdrop" aria-hidden="true" />
      <main id="main" className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Wordmark to="/" />
        </div>
        <div className="rounded-lg bg-paper p-6 sm:p-8">
          <h1 className="m-0 mb-1 font-display text-display font-semibold">Staff sign in</h1>
          <p className="mt-0 mb-6 text-small text-ink-2">For the restaurant team. The owner creates your account.</p>
          <form onSubmit={submit} noValidate className="grid gap-4">
            <TextField
              label="Phone number or name"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              error={errors.identifier}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            {formError && (
              <p role="alert" className="m-0 text-small font-medium text-danger">
                {formError}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" busy={busy}>
              Sign in
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}

/** Page heading row used by every dashboard screen. */
export function StaffPageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="m-0 font-display text-display font-semibold">{title}</h1>
        {description && <p className="m-0 max-w-measure text-small text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
