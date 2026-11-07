import { useEffect, useMemo, useState } from "react";
import { formatRupees } from "../../../shared/bill";
import { formatPhone } from "../../../shared/phone";
import { formatTime, minutesAgo } from "../../../shared/time";
import { ACTIVE_STATUSES, STATUS_LABEL, type Order, type StaffOrdersResponse } from "../../../shared/types";
import { buttonClasses } from "../../components/ui/button-classes";
import { cn } from "../../components/ui/cn";
import { TextField } from "../../components/ui/field";
import { Icon } from "../../components/ui/icons";
import { Badge, Button, Dialog, ErrorBlock, LoadingBlock, Notice } from "../../components/ui/primitives";
import { api, errorMessage } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { useResource } from "../../lib/use-resource";
import { statusTone } from "../customer/orders";
import { useOrderAlert } from "./alerts";
import { StaffPageHeader } from "./app";

type Tab = "new" | "active" | "done" | "unpaid";

export function OrdersBoard() {
  const toast = useToast();
  const board = useResource<StaffOrdersResponse>("staff-orders", (signal) => api<StaffOrdersResponse>("/staff/orders", { signal }), {
    pollMs: 7000,
  });
  const [tab, setTab] = useState<Tab>("new");
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const orders = useMemo(() => board.data?.orders ?? [], [board.data]);
  const groups = useMemo(
    () => ({
      new: orders.filter((o) => o.status === "new"),
      active: orders.filter((o) => ACTIVE_STATUSES.includes(o.status) && o.status !== "new"),
      done: orders.filter((o) => o.status === "delivered" || o.status === "cancelled"),
      unpaid: orders.filter((o) => o.status === "pending_payment"),
    }),
    [orders],
  );
  const unack = groups.new.filter((o) => !o.acknowledged).length;
  const newestId = orders.length ? Math.max(...orders.map((o) => o.id)) : null;
  const alert = useOrderAlert(unack, board.data ? newestId : null);

  async function act(o: Order, action: string, reason?: string) {
    try {
      const r = await api<{ order: Order }>(`/staff/orders/${o.id}`, { method: "PATCH", body: { action, reason } });
      board.setData((d) => (d ? { ...d, orders: d.orders.map((x) => (x.id === o.id ? r.order : x)) } : d));
      if (action !== "ack") toast(`Order ${o.orderNo}: ${STATUS_LABEL[r.order.status]}.`, "ok");
      void board.reload();
      return true;
    } catch (e) {
      toast(errorMessage(e), "danger");
      void board.reload();
      return false;
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "new", label: "New", count: groups.new.length },
    { key: "active", label: "In progress", count: groups.active.length },
    { key: "done", label: "Done today", count: groups.done.length },
    ...(groups.unpaid.length ? [{ key: "unpaid" as const, label: "Awaiting payment", count: groups.unpaid.length }] : []),
  ];
  const visible = groups[tab];

  return (
    <>
      <StaffPageHeader
        title="Orders"
        description="New orders ring until someone acknowledges them. Call the customer, then confirm the order."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={alert.soundOn ? "bell" : "bellOff"} onClick={alert.toggleSound} aria-pressed={alert.soundOn}>
              {alert.soundOn ? "Sound on" : "Sound off"}
            </Button>
            {alert.soundOn && (
              <Button variant="ghost" size="sm" onClick={() => void alert.testSound()}>
                Test sound
              </Button>
            )}
            {alert.notificationsAvailable && alert.notifPermission === "default" && (
              <Button variant="ghost" size="sm" onClick={() => void alert.askNotifications()}>
                Allow notifications
              </Button>
            )}
          </>
        }
      />

      {alert.soundOn && alert.needsTap && (
        <Notice
          tone="warn"
          title="Tap here to turn on the order sound."
          className="mb-4"
          action={
            <Button variant="primary" size="sm" icon="bell" onClick={() => void alert.unlock()}>
              Turn on sound
            </Button>
          }
        >
          Browsers keep pages silent until you tap them once.
        </Notice>
      )}

      {board.data && (
        <dl className="mb-6 grid grid-cols-3 gap-3 sm:max-w-xl">
          <Stat label="Waiting" value={String(unack)} highlight={unack > 0} />
          <Stat label="Orders today" value={String(board.data.summary.ordersToday)} />
          <Stat label="Sales today" value={formatRupees(board.data.summary.revenueTodayPaise)} />
        </dl>
      )}

      <div role="tablist" aria-label="Order groups" className="no-scrollbar mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="order-panel"
            onClick={() => setTab(t.key)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.key === t.key);
              const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length] : null;
              if (next) {
                setTab(next.key);
                document.getElementById(`tab-${next.key}`)?.focus();
              }
            }}
            tabIndex={tab === t.key ? 0 : -1}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-small font-semibold whitespace-nowrap",
              tab === t.key ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            <span className={cn("num rounded-xs px-1.5 py-0.5 text-label", t.key === "new" && t.count > 0 ? "bg-accent text-on-accent" : "bg-paper-sunken text-ink-2")}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div id="order-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {board.loading && !board.data ? (
          <LoadingBlock label="Loading orders" />
        ) : board.error && !board.data ? (
          <ErrorBlock message={board.error} onRetry={() => void board.reload()} />
        ) : visible.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-10 text-center text-ink-2">
            {tab === "new" ? "No new orders. This page checks every few seconds." : "Nothing here yet."}
          </p>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((o) => (
              <OrderCard key={o.id} order={o} now={now} onAct={act} onCancel={() => setCancelling(o)} />
            ))}
          </ul>
        )}
        {board.error && board.data && (
          <p role="status" className="mt-4 text-small text-danger">
            Could not refresh: {board.error} Showing the last loaded orders.
          </p>
        )}
      </div>

      <CancelDialog
        order={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={async (reason) => {
          if (cancelling && (await act(cancelling, "cancel", reason))) setCancelling(null);
        }}
      />
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-md border px-4 py-3", highlight ? "border-accent bg-accent text-on-accent" : "border-line bg-paper-raised")}>
      <dt className={cn("text-small", highlight ? "text-on-accent" : "text-ink-2")}>{label}</dt>
      <dd className="num m-0 font-display text-title font-semibold">{value}</dd>
    </div>
  );
}

function OrderCard({
  order: o,
  now,
  onAct,
  onCancel,
}: {
  order: Order;
  now: number;
  onAct: (o: Order, action: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (action: string) => {
    setBusy(action);
    await onAct(o, action);
    setBusy(null);
  };
  const mins = minutesAgo(o.createdAt, now);
  const ringing = o.status === "new" && !o.acknowledged;
  const itemCount = o.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <li
      className={cn("grid content-start gap-4 rounded-md border bg-paper-raised p-4", ringing ? "ringing border-accent" : "border-line")}
      aria-labelledby={`order-${o.id}-title`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id={`order-${o.id}-title`} className="m-0 font-display text-title font-semibold">
            {o.orderNo} <span className="sr-only">, {STATUS_LABEL[o.status]}</span>
          </h2>
          <span className="text-small text-ink-2">
            <time dateTime={o.createdAt}>{formatTime(o.createdAt)}</time> · {mins < 1 ? "just now" : `${mins} min ago`}
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {ringing && <Badge tone="accent">New</Badge>}
          {!ringing && <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>}
          <Badge tone={o.paymentStatus === "paid" ? "ok" : "neutral"}>
            {o.paymentMethod === "cod" ? (o.paymentStatus === "paid" ? "Paid" : "Pay on delivery") : o.paymentStatus === "paid" ? "Paid online" : "Online · unpaid"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="m-0 font-semibold">{o.customerName}</p>
        <a href={`tel:${o.customerPhone}`} className={buttonClasses(ringing ? "primary" : "secondary", "md", "justify-start")}>
          <Icon name="phone" size={18} />
          <span className="num">{formatPhone(o.customerPhone)}</span>
        </a>
        <p className="m-0 text-small text-ink-2">
          {o.address.line1}
          {o.address.landmark && <> · Landmark: {o.address.landmark}</>}
          <br />
          {o.address.area} {o.address.pincode}
        </p>
      </div>

      <div className="grid gap-1.5">
        <ul className="m-0 grid list-none gap-1 p-0 text-small">
          {o.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                <strong className="num">{l.qty} ×</strong> {l.name}
                {l.variantName && <span className="text-ink-2"> ({l.variantName})</span>}
              </span>
              <span className="num text-ink-2">{formatRupees(l.qty * l.unitPricePaise)}</span>
            </li>
          ))}
        </ul>
        {o.note && <p className="m-0 rounded-sm bg-warn-soft px-3 py-2 text-small"><strong>Note:</strong> {o.note}</p>}
        <p className="m-0 flex justify-between border-t border-line pt-2 text-small">
          <span className="text-ink-2">
            {itemCount} items · GST {formatRupees(o.gstPaise)} · delivery {o.deliveryFeePaise ? formatRupees(o.deliveryFeePaise) : "free"}
          </span>
          <strong className="num">{formatRupees(o.totalPaise)}</strong>
        </p>
        {o.status === "cancelled" && o.cancelReason && <p className="m-0 text-small text-danger">Cancelled: {o.cancelReason}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {ringing && (
          <Button variant="accent" size="sm" icon="bellOff" busy={busy === "ack"} onClick={() => void run("ack")}>
            Acknowledge
          </Button>
        )}
        {o.status === "new" && (
          <Button variant="primary" size="sm" icon="check" busy={busy === "confirm"} onClick={() => void run("confirm")}>
            Confirmed on call
          </Button>
        )}
        {o.status === "confirmed" && (
          <Button variant="primary" size="sm" busy={busy === "preparing"} onClick={() => void run("preparing")}>
            Start preparing
          </Button>
        )}
        {(o.status === "confirmed" || o.status === "preparing") && (
          <Button variant={o.status === "preparing" ? "primary" : "secondary"} size="sm" busy={busy === "out_for_delivery"} onClick={() => void run("out_for_delivery")}>
            Out for delivery
          </Button>
        )}
        {o.status === "out_for_delivery" && (
          <Button variant="primary" size="sm" icon="check" busy={busy === "delivered"} onClick={() => void run("delivered")}>
            Delivered
          </Button>
        )}
        {o.status !== "delivered" && o.status !== "cancelled" && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel order
          </Button>
        )}
      </div>
    </li>
  );
}

const REASONS = ["Customer did not answer the call", "Customer asked to cancel", "Dish not available", "Outside our delivery area"];

function CancelDialog({ order, onClose, onConfirm }: { order: Order | null; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setReason("");
    setError(undefined);
  }, [order]);
  return (
    <Dialog
      open={order !== null}
      onClose={onClose}
      title={order ? `Cancel order ${order.orderNo}?` : "Cancel order"}
      description="The customer sees this reason on their order page."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Keep order
          </Button>
          <Button
            variant="danger"
            busy={busy}
            onClick={async () => {
              if (!reason.trim()) return setError("Choose or type a reason.");
              setBusy(true);
              await onConfirm(reason.trim());
              setBusy(false);
            }}
          >
            Cancel order
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "min-h-11 rounded-sm border px-3 text-small font-medium sm:min-h-9",
                reason === r ? "border-brand bg-paper-sunken text-ink" : "border-line text-ink-2 hover:border-line-strong",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={error} maxLength={200} />
      </div>
    </Dialog>
  );
}
