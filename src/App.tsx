import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Outlet, Route, Routes, useLocation } from "react-router";
import { buttonClasses } from "./components/ui/button-classes";
import { LoadingBlock } from "./components/ui/primitives";
import { AccountPage } from "./features/customer/account";
import { CheckoutPage } from "./features/customer/checkout";
import { HomePage } from "./features/customer/home";
import { CustomerLayout, PagePanel } from "./features/customer/layout";
import { OrderPage, OrdersPage, RequireCustomer } from "./features/customer/orders";
import { SignInPage } from "./features/customer/signin";
import { CustomerAuthProvider } from "./lib/auth";
import { CartProvider } from "./lib/cart";
import { MenuProvider } from "./lib/menu";
import { ToastProvider } from "./lib/toast";

// The staff dashboard is a separate bundle: customers never download it.
const StaffApp = lazy(() => import("./features/staff/app"));

const TITLES: [RegExp, string][] = [
  [/^\/checkout/, "Checkout"],
  [/^\/orders\/\d+/, "Your order"],
  [/^\/orders/, "My orders"],
  [/^\/account/, "Account"],
  [/^\/signin/, "Sign in"],
];

function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/staff")) return;
    const t = TITLES.find(([re]) => re.test(pathname))?.[1];
    document.title = t ? `${t} · Ananth Residency` : "Ananth Residency · Order pure vegetarian food in Hubballi";
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function CustomerProviders() {
  return (
    <CustomerAuthProvider>
      <CartProvider>
        <MenuProvider>
          <Outlet />
        </MenuProvider>
      </CartProvider>
    </CustomerAuthProvider>
  );
}

function NotFound() {
  return (
    <PagePanel title="Page not found">
      <p className="mt-0">That page does not exist. The menu is one tap away.</p>
      <Link to="/" className={buttonClasses("primary")}>
        Go to the menu
      </Link>
    </PagePanel>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DocumentTitle />
        <Routes>
          <Route
            path="/staff/*"
            element={
              <Suspense fallback={<LoadingBlock label="Opening the dashboard" />}>
                <StaffApp />
              </Suspense>
            }
          />
          <Route element={<CustomerProviders />}>
            <Route element={<CustomerLayout />}>
              <Route index element={<HomePage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="signin" element={<SignInPage />} />
              <Route path="orders" element={<RequireCustomer><OrdersPage /></RequireCustomer>} />
              <Route path="orders/:id" element={<RequireCustomer><OrderPage /></RequireCustomer>} />
              <Route path="account" element={<RequireCustomer><AccountPage /></RequireCustomer>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
