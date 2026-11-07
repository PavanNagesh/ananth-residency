import { useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router";
import { formatPercentFromBps, formatRupees } from "../../../shared/bill";
import { formatPhone } from "../../../shared/phone";
import { formatDateTime, formatTime } from "../../../shared/time";
import { FINAL_STATUSES, STATUS_LABEL, type Order, type OrderStatus, type PlaceOrderResponse } from "../../../shared/types";
import { buttonClasses } from "../../components/ui/button-classes";
import { cn } from "../../components/ui/cn";
import { Icon } from "../../components/ui/icons";
import { Badge, Button, ErrorBlock, LoadingBlock, Notice } from "../../components/ui/primitives";
import { api, errorMessage } from "../../lib/api";
import { useCustomer } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { useMenu } from "../../lib/menu";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { addressLines } from "./address-form";
import { PagePanel } from "./layout";
import { openRazorpay } from "./razorpay";

const STEPS: OrderStatus[] = ["new", "confirmed", "preparing", "out_for_delivery", "delivered"];

export function statusTone(s: OrderStatus): "neutral" | "ok" | "warn" | "danger" | "accent" {
  if (s === "delivered") return "ok";
  if (s === "cancelled") return "danger";
  if (s === "pending_payment") return "warn";
  if (s === "new") return "accent";
  return "neutral";
}

export function RequireCustomer({ children }: { children: React.ReactNode }) {
  const { customer, ready } = useCustomer();
  const location = useLocation();
  if (!ready) return <PagePanel title="One moment"><LoadingBlock /></PagePanel>;
  if (!customer?.name) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <>{children}</>;
}

export function OrderPage() {
  const { id } = useParams();
  const location = useLocation();
  const justPlaced = (location.state as { justPlaced?: boolean } | null)?.justPlaced;
  const menu = useMenu();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const order = useResource<Order>(
    `order-${id}`,
    (signal) => api<{ order: Order }>(`/orders/${id}`, { signal }).then((r) => r.order),
    { pollMs: 10_000 },
  );

  const o = order.data;
  const restaurantPhone = menu.data?.restaurant.phone;

  async function cancel() {
    if (!o || !window.confirm("Cancel this order?")) return;
    setBusy("cancel");
    try {
      const r = await api<{ order: Order }>(`/orders/${o.id}/cancel`, { body: {} });
      order.setData(() => r.order);
      toast("Order cancelled.", "ok");
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  async function pay(method: "online" | "cod") {
    if (!o) return;
    setBusy(method);
    try {
      const r = await api<PlaceOrderResponse>(`/orders/${o.id}/payment`, { body: { method } });
      if (r.razorpay) {
        const paid = await openRazorpay(r.razorpay);
        if (paid) await api("/payments/razorpay/verify", { body: { orderId: o.id, ...paid } });
      }
      await order.reload();
    } catch (e) {
      toast(errorMessage(e), "danger");
    } finally {
      setBusy(null);
    }
  }

  return (
    <PagePanel title={o ? `Order ${o.orderNo}` : "Your order"} back={{ to: "/orders", label: "All orders" }}>
      {order.loading && !o ? (
        <LoadingBlock label="Loading your order" />
      ) : order.error && !o ? (
        <ErrorBlock message={order.error} onRetry={() => void order.reload()} />
      ) : o ? (
        <div className="grid gap-8">
          {justPlaced && o.status === "new" && (
            <Notice tone="ok" title="Order placed." live>
              The restaurant will call you on {formatPhone(o.customerPhone)} to confirm it.
            </Notice>
          )}
          {o.status === "pending_payment" && (
            <Notice tone="warn" title="Payment not completed." live>
              <p className="m-0 mb-3">The kitchen sees your order once it is paid. Try again, or pay when it arrives.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="accent" size="sm" busy={busy === "online"} onClick={() => void pay("online")}>
                  Pay {formatRupees(o.totalPaise)} now
                </Button>
                <Button variant="secondary" size="sm" busy={busy === "cod"} onClick={() => void pay("cod")}>
                  Pay on delivery instead
                </Button>
              </div>
            </Notice>
          )}
          {o.status === "cancelled" ? (
            <Notice tone="danger" title="This order was cancelled.">
              {o.cancelReason}
            </Notice>
          ) : o.status !== "pending_payment" ? (
            <Timeline order={o} />
          ) : null}

          <section aria-labelledby="items-h" className="grid gap-3">
            <h2 id="items-h" className="m-0 font-display text-title font-semibold">
              Items
            </h2>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {o.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>
                    <span className="num">{l.qty} ×</span> {l.name}
                    {l.variantName && <span className="text-ink-3"> ({l.variantName})</span>}
                  </span>
                  <span className="num">{formatRupees(l.qty * l.unitPricePaise)}</span>
                </li>
              ))}
            </ul>
            {o.note && <p className="m-0 text-small text-ink-2">Note: {o.note}</p>}
            <dl className="m-0 grid gap-1.5 border-t border-line pt-3 text-small">
              <BillRow label="Items total" value={formatRupees(o.subtotalPaise)} />
              <BillRow label={`GST${o.subtotalPaise ? ` (${formatPercentFromBps(Math.round((o.gstPaise / o.subtotalPaise) * 10000))})` : ""}`} value={formatRupees(o.gstPaise)} />
              <BillRow label="Delivery fee" value={o.deliveryFeePaise ? formatRupees(o.deliveryFeePaise) : "Free"} />
              <div className="flex justify-between pt-1 text-body font-semibold">
                <dt>Total</dt>
                <dd className="num m-0">{formatRupees(o.totalPaise)}</dd>
              </div>
            </dl>
            <p className="m-0 text-small text-ink-2">
              {o.paymentMethod === "cod" ? "Pay on delivery" : "Paid online"}
              {o.paymentStatus === "paid" && o.paymentMethod === "online" ? " · payment received" : ""}
            </p>
          </section>

          <section aria-labelledby="addr-h" className="grid gap-2">
            <h2 id="addr-h" className="m-0 font-display text-title font-semibold">
              Delivering to
            </h2>
            <p className="m-0 text-ink-2">{addressLines(o.address)}</p>
          </section>

          <div className="flex flex-wrap gap-2">
            {restaurantPhone && (
              <a href={`tel:${restaurantPhone}`} className={buttonClasses("primary")}>
                <Icon name="phone" size={18} />
                Call the restaurant
              </a>
            )}
            {(o.status === "new" || o.status === "pending_payment") && (
              <Button variant="danger" busy={busy === "cancel"} onClick={() => void cancel()}>
                Cancel order
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </PagePanel>
  );
}

function BillRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="num m-0">{value}</dd>
    </div>
  );
}

function Timeline({ order }: { order: Order }) {
  const currentIndex = STEPS.indexOf(order.status);
  const at = (s: OrderStatus) => order.events.findLast((e) => e.status === s)?.at;
  const live = !FINAL_STATUSES.includes(order.status);
  return (
    <section aria-labelledby="status-h" className="grid gap-3">
      <h2 id="status-h" className="m-0 font-display text-title font-semibold">
        Status
      </h2>
      <p className="sr-only" role="status">
        Current status: {STATUS_LABEL[order.status]}.
      </p>
      <ol className="m-0 grid list-none gap-0 p-0">
        {STEPS.map((s, i) => {
          const done = i <= currentIndex;
          const current = i === currentIndex;
          const time = at(s);
          return (
            <li key={s} className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? "step" : undefined}>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className={cn("absolute top-6 bottom-0 left-[11px] w-0.5", i < currentIndex ? "bg-ok" : "bg-line")} />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  "relative z-10 inline-flex size-6 shrink-0 items-center justify-center rounded-pill border-2",
                  done ? "border-ok bg-ok text-paper" : "border-line-strong bg-paper",
                )}
              >
                {done && <Icon name="check" size={14} strokeWidth={2.5} />}
              </span>
              <div className="grid">
                <span className={cn("font-semibold", !done && "text-ink-3")}>
                  {s === "new" ? "Order placed" : STATUS_LABEL[s]}
                  {current && live && s === "new" && <span className="font-normal text-ink-2"> · waiting for the restaurant to call</span>}
                </span>
                {time && <time className="text-small text-ink-3" dateTime={time}>{formatTime(time)}</time>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function OrdersPage() {
  const cart = useCart();
  const menu = useMenu();
  const toast = useToast();
  const orders = useResource<Order[]>("my-orders", (signal) => api<{ orders: Order[] }>("/orders", { signal }).then((r) => r.orders), {
    pollMs: 30_000,
  });

  function reorder(o: Order) {
    const items = new Map((menu.data?.categories ?? []).flatMap((c) => c.items).map((i) => [i.id, i]));
    let added = 0;
    const missing: string[] = [];
    for (const l of o.lines) {
      const item = items.get(l.itemId);
      const variant = l.variantId ? item?.variants.find((v) => v.id === l.variantId) : null;
      if (!item || (l.variantId ? !variant : item.variants.length > 0)) {
        missing.push(l.name);
        continue;
      }
      cart.add(
        { itemId: item.id, variantId: variant?.id ?? null, name: item.name, variantName: variant?.name ?? null, unitPricePaise: variant?.pricePaise ?? item.pricePaise },
        l.qty,
      );
      added++;
    }
    if (added) toast(missing.length ? `Added to cart. Not available now: ${missing.join(", ")}.` : "Added to your cart.", missing.length ? "danger" : "ok");
    else toast("None of these dishes are available right now.", "danger");
  }

  return (
    <PagePanel title="My orders" back={{ to: "/", label: "Back to menu" }}>
      {orders.loading && !orders.data ? (
        <LoadingBlock label="Loading your orders" />
      ) : orders.error && !orders.data ? (
        <ErrorBlock message={orders.error} onRetry={() => void orders.reload()} />
      ) : orders.data && orders.data.length === 0 ? (
        <div className="grid gap-3">
          <p className="m-0">You have not ordered yet.</p>
          <Link to="/" className={cn(buttonClasses("primary"), "justify-self-start")}>
            Browse the menu
          </Link>
        </div>
      ) : (
        <ul className="m-0 grid list-none divide-y divide-line p-0">
          {orders.data?.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="grid gap-1">
                <Link to={`/orders/${o.id}`} className="font-semibold text-ink">
                  Order {o.orderNo}
                </Link>
                <span className="text-small text-ink-2">
                  <time dateTime={o.createdAt}>{formatDateTime(o.createdAt)}</time> · {o.lines.reduce((n, l) => n + l.qty, 0)} items ·{" "}
                  <span className="num">{formatRupees(o.totalPaise)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
                <Button variant="secondary" size="sm" onClick={() => reorder(o)}>
                  Order again
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PagePanel>
  );
}
