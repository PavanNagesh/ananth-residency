import type { ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { formatPhone } from "../../../shared/phone";
import { Wordmark } from "../../components/brand";
import { InstallButton } from "../../components/install-app";
import { cn } from "../../components/ui/cn";
import { Icon } from "../../components/ui/icons";
import { useCustomer } from "../../lib/auth";
import { BRAND } from "../../lib/brand";
import { useMenu } from "../../lib/menu";

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm px-3 text-small font-semibold text-on-brand no-underline transition-colors duration-(--dur-quick) hover:bg-white/8",
    isActive && "bg-white/10",
  );

export function SiteHeader() {
  const { customer, ready } = useCustomer();
  return (
    <header className="wrap flex items-center justify-between gap-3 py-4">
      <Wordmark />
      <nav aria-label="Account" className="flex items-center gap-1">
        {ready && customer && (
          <NavLink to="/orders" className={navLink}>
            <Icon name="receipt" size={18} />
            <span className="max-sm:sr-only">My orders</span>
          </NavLink>
        )}
        {ready && (
          <NavLink to={customer ? "/account" : "/signin"} className={navLink}>
            <Icon name="user" size={18} />
            <span className="max-sm:sr-only">{customer ? (customer.name || "Account") : "Sign in"}</span>
          </NavLink>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const menu = useMenu();
  const r = menu.data?.restaurant;
  return (
    <footer className="wrap grid gap-2 py-8 text-small text-on-brand-2">
      <p className="m-0 font-display text-body text-on-brand">{BRAND.nameEn}</p>
      <p className="m-0">{r?.address ?? "Station Road, behind LIC Office, J C Nagar, Hubballi 580020"}</p>
      {r && (
        <p className="m-0">
          Questions about an order?{" "}
          <a href={`tel:${r.phone}`} className="font-semibold text-on-brand">
            Call {formatPhone(r.phone)}
          </a>
        </p>
      )}
      <div className="my-2">
        <InstallButton variant="on-brand" />
      </div>
      <p className="m-0">
        <Link to="/staff" className="inline-flex min-h-11 items-center text-on-brand-2">
          Restaurant staff sign in
        </Link>
      </p>
    </footer>
  );
}

/** Shell for every customer page: dimmed restaurant photo behind, header, paper panel. */
export function CustomerLayout() {
  return (
    <>
      <div className="app-backdrop" aria-hidden="true" />
      <a href="#main" className="sr-only-focusable rounded-sm bg-accent px-4 py-3 font-semibold text-on-accent">
        Skip to content
      </a>
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </>
  );
}

/** Paper panel used by inner pages (checkout, orders, account). */
export function PagePanel({ title, children, back }: { title: string; children: ReactNode; back?: { to: string; label: string } }) {
  return (
    <main id="main" className="wrap pb-8">
      <div className="mx-auto max-w-narrow rounded-lg bg-paper px-5 py-6 sm:px-8 sm:py-8">
        {back && (
          <Link
            to={back.to}
            className="mb-3 -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1 text-small font-semibold text-ink-2 no-underline hover:text-ink"
          >
            <Icon name="arrowLeft" size={16} />
            {back.label}
          </Link>
        )}
        <h1 className="m-0 mb-6 font-display text-display font-semibold">{title}</h1>
        {children}
      </div>
    </main>
  );
}
