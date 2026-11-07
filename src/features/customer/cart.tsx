import { useState } from "react";
import { useNavigate } from "react-router";
import { computeBill, formatPercentFromBps, formatRupees, type Bill, type Pricing } from "../../../shared/bill";
import { buttonClasses } from "../../components/ui/button-classes";
import { cn } from "../../components/ui/cn";
import { Icon } from "../../components/ui/icons";
import { Dialog, QtyStepper } from "../../components/ui/primitives";
import { useCart } from "../../lib/cart";
import { useMenu } from "../../lib/menu";

export function BillSummary({ bill, pricing, compact }: { bill: Bill; pricing: Pricing; compact?: boolean }) {
  return (
    <dl className={cn("m-0 grid gap-1.5 text-small", compact ? "" : "text-body")}>
      <Row label="Items total" value={formatRupees(bill.subtotalPaise)} />
      <Row label={`GST (${formatPercentFromBps(pricing.gstBps)})`} value={formatRupees(bill.gstPaise)} />
      <Row
        label="Delivery fee"
        value={bill.deliveryFeePaise === 0 ? (bill.subtotalPaise > 0 ? "Free" : formatRupees(0)) : formatRupees(bill.deliveryFeePaise)}
        highlight={bill.deliveryFeePaise === 0 && bill.subtotalPaise > 0}
      />
      <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-2.5">
        <dt className="font-semibold">To pay</dt>
        <dd className="num m-0 font-display text-title font-semibold">{formatRupees(bill.totalPaise)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-2">{label}</dt>
      <dd className={cn("num m-0", highlight ? "font-semibold text-ok" : "text-ink")}>{value}</dd>
    </div>
  );
}

export function FreeDeliveryNudge({ bill, pricing }: { bill: Bill; pricing: Pricing }) {
  if (bill.subtotalPaise === 0) return null;
  const free = bill.remainingForFreeDeliveryPaise === 0;
  const pct = Math.min(100, Math.round((bill.subtotalPaise / Math.max(1, pricing.freeDeliveryThresholdPaise)) * 100));
  return (
    <div className="grid gap-2">
      <p className={cn("m-0 text-small", free ? "font-semibold text-ok" : "text-ink-2")}>
        {free
          ? "You get free delivery on this order."
          : `Add ${formatRupees(bill.remainingForFreeDeliveryPaise)} more for free delivery.`}
      </p>
      <div className="h-1.5 overflow-hidden rounded-pill bg-paper-sunken" aria-hidden="true">
        <div className={cn("h-full rounded-pill", free ? "bg-ok" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Cart lines + bill + checkout button. Used in the desktop sidebar and the phone sheet. */
export function CartContents({ onCheckout }: { onCheckout?: () => void }) {
  const cart = useCart();
  const menu = useMenu();
  const navigate = useNavigate();
  const pricing = menu.data?.pricing;
  const restaurant = menu.data?.restaurant;

  if (cart.count === 0) {
    return (
      <div className="grid justify-items-center gap-2 py-8 text-center">
        <Icon name="cart" size={28} className="text-ink-3" />
        <p className="m-0 font-semibold">Your cart is empty.</p>
        <p className="m-0 text-small text-ink-2">Add dishes from the menu to start an order.</p>
      </div>
    );
  }

  const bill = pricing ? computeBill(cart.subtotalPaise, pricing) : null;
  const paused = restaurant && !restaurant.acceptingOrders;

  return (
    <div className="grid gap-4">
      <ul className="m-0 grid list-none gap-3 p-0">
        {cart.lines.map((l) => (
          <li key={l.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="m-0 text-small leading-snug font-semibold">{l.name}</p>
              {l.variantName && <p className="m-0 text-small text-ink-3">{l.variantName}</p>}
              <p className="num m-0 text-small text-ink-2">{formatRupees(l.unitPricePaise * l.qty)}</p>
            </div>
            <QtyStepper
              qty={l.qty}
              name={l.variantName ? `${l.name}, ${l.variantName}` : l.name}
              onChange={(q) => cart.setQty(l.key, q)}
            />
          </li>
        ))}
      </ul>
      {bill && pricing && (
        <>
          <FreeDeliveryNudge bill={bill} pricing={pricing} />
          <BillSummary bill={bill} pricing={pricing} compact />
        </>
      )}
      {paused ? (
        <p className="m-0 rounded-sm bg-warn-soft px-3 py-2.5 text-small font-medium text-ink">{restaurant.pausedMessage}</p>
      ) : (
        <button
          type="button"
          className={buttonClasses("accent", "lg", "w-full justify-between")}
          onClick={() => {
            onCheckout?.();
            navigate("/checkout");
          }}
        >
          <span>Checkout</span>
          {bill && <span className="num">{formatRupees(bill.totalPaise)}</span>}
        </button>
      )}
    </div>
  );
}

/** Phone-sized sticky bar that opens the cart as a bottom sheet. */
export function MobileCartBar() {
  const cart = useCart();
  const [open, setOpen] = useState(false);
  if (cart.count === 0) return null;
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper-raised/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <button type="button" className={buttonClasses("accent", "lg", "w-full justify-between")} onClick={() => setOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <Icon name="cart" size={18} />
            {cart.count} {cart.count === 1 ? "item" : "items"}
          </span>
          <span className="inline-flex items-center gap-1">
            View cart <span className="num">· {formatRupees(cart.subtotalPaise)}</span>
          </span>
        </button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Your order">
        <CartContents onCheckout={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
