import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { computeBill, formatRupees } from "../../../shared/bill";
import { formatPhone } from "../../../shared/phone";
import type { Address, PlaceOrderResponse } from "../../../shared/types";
import { buttonClasses } from "../../components/ui/button-classes";
import { cn } from "../../components/ui/cn";
import { TextArea } from "../../components/ui/field";
import { Icon, type IconName } from "../../components/ui/icons";
import { LocationPicker, type Pin } from "../../components/map";
import { Button, Dialog, LoadingBlock, Notice } from "../../components/ui/primitives";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useCustomer } from "../../lib/auth";
import { useCart } from "../../lib/cart";
import { storage } from "../../lib/storage";
import { useMenu } from "../../lib/menu";
import { useResource } from "../../lib/use-resource";
import { AddressForm, addressLines } from "./address-form";
import { BillSummary, FreeDeliveryNudge } from "./cart";
import { PagePanel } from "./layout";
import { openRazorpay } from "./razorpay";
import { SignInForm } from "./signin";

export function CheckoutPage() {
  const cart = useCart();
  const menu = useMenu();
  const { customer, ready } = useCustomer();
  const navigate = useNavigate();
  const signedIn = Boolean(customer?.name);

  const addrs = useResource<Address[]>(signedIn ? `addresses-${customer!.id}` : null, (signal) =>
    api<{ addresses: Address[] }>("/me/addresses", { signal }).then((r) => r.addresses),
  );
  const [addressId, setAddressId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [pinFor, setPinFor] = useState<Address | null>(null);
  const [payment, setPayment] = useState<"cod" | "online">("cod");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (addrs.data && addressId === null) {
      const def = addrs.data.find((a) => a.isDefault) ?? addrs.data[0];
      if (def) setAddressId(def.id);
      else setAdding(true);
    }
  }, [addrs.data, addressId]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const data = menu.data;
  if (!data) return <PagePanel title="Checkout"><LoadingBlock /></PagePanel>;

  if (cart.count === 0) {
    return (
      <PagePanel title="Checkout" back={{ to: "/", label: "Back to menu" }}>
        <p className="mt-0">Your cart is empty.</p>
        <Link to="/" className={buttonClasses("primary")}>
          Browse the menu
        </Link>
      </PagePanel>
    );
  }

  const bill = computeBill(cart.subtotalPaise, data.pricing);
  const paused = !data.restaurant.acceptingOrders;
  const online = data.restaurant.onlinePaymentAvailable;

  async function place() {
    if (!addressId) return setError("Choose or add a delivery address.");
    setError(null);
    setPlacing(true);
    try {
      const res = await api<PlaceOrderResponse>("/orders", {
        body: {
          lines: cart.lines.map((l) => ({ itemId: l.itemId, variantId: l.variantId, qty: l.qty })),
          addressId,
          paymentMethod: payment,
          note: cart.note,
        },
      });
      cart.clear();
      storage.set("ar.hasOrdered", true);
      if (res.razorpay) {
        const paid = await openRazorpay(res.razorpay).catch(() => null);
        if (paid) {
          await api("/payments/razorpay/verify", { body: { orderId: res.order.id, ...paid } }).catch(() => {});
        }
      }
      navigate(`/orders/${res.order.id}`, { replace: true, state: { justPlaced: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : errorMessage(err));
      if (err instanceof ApiError && err.status === 409) void menu.reload();
    } finally {
      setPlacing(false);
    }
  }

  return (
    <PagePanel title="Checkout" back={{ to: "/", label: "Back to menu" }}>
      <ol className="m-0 grid list-none gap-8 p-0">
        <Step n={1} title="Your number">
          {!ready ? (
            <LoadingBlock />
          ) : signedIn ? (
            <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{customer!.name}</span>
              <span className="num text-ink-2">{formatPhone(customer!.phone)}</span>
            </p>
          ) : (
            <SignInForm />
          )}
        </Step>

        <Step n={2} title="Deliver to" disabled={!signedIn}>
          {!signedIn ? (
            <p className="m-0 text-small text-ink-3">Sign in first to choose an address.</p>
          ) : addrs.loading && !addrs.data ? (
            <LoadingBlock label="Loading your addresses" />
          ) : (
            <div className="grid gap-3">
              {addrs.data && addrs.data.length > 0 && (
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className="sr-only">Delivery address</legend>
                  {addrs.data.map((a) => (
                    <Choice
                      key={a.id}
                      name="address"
                      checked={addressId === a.id}
                      onChange={() => {
                        setAddressId(a.id);
                        setAdding(false);
                      }}
                      icon="pin"
                      title={a.label || "Address"}
                      detail={addressLines(a)}
                    />
                  ))}
                </fieldset>
              )}
              {(() => {
                const chosen = addrs.data?.find((a) => a.id === addressId);
                if (!chosen || adding || (chosen.lat !== null && chosen.lng !== null)) return null;
                return (
                  <Notice
                    tone="warn"
                    title="This address has no map location."
                    action={
                      <Button variant="primary" size="sm" icon="pin" onClick={() => setPinFor(chosen)}>
                        Add map location
                      </Button>
                    }
                  >
                    Share where you are so the rider can find your door.
                  </Notice>
                );
              })()}
              {adding ? (
                <div className="rounded-md border border-line p-4">
                  <h3 className="m-0 mb-3 text-body font-semibold">New address</h3>
                  <AddressForm
                    onSaved={(a) => {
                      addrs.setData((list) => [a, ...(list ?? []).map((x) => (a.isDefault ? { ...x, isDefault: false } : x))]);
                      setAddressId(a.id);
                      setAdding(false);
                    }}
                    onCancel={addrs.data?.length ? () => setAdding(false) : undefined}
                  />
                </div>
              ) : (
                <Button variant="secondary" size="sm" icon="plus" className="justify-self-start" onClick={() => setAdding(true)}>
                  Add a new address
                </Button>
              )}
            </div>
          )}
        </Step>

        <Step n={3} title="Payment" disabled={!signedIn}>
          <fieldset className="m-0 grid gap-2 border-0 p-0" disabled={!signedIn}>
            <legend className="sr-only">How would you like to pay?</legend>
            <Choice
              name="payment"
              checked={payment === "cod"}
              onChange={() => setPayment("cod")}
              icon="wallet"
              title="Pay on delivery"
              detail="Cash or UPI to the delivery person."
            />
            <Choice
              name="payment"
              checked={payment === "online"}
              onChange={() => setPayment("online")}
              icon="card"
              title="Pay online now"
              detail={online ? "UPI, cards or net banking through Razorpay." : "Not available right now."}
              disabled={!online}
            />
          </fieldset>
        </Step>

        <Step n={4} title="Review and place order" disabled={!signedIn}>
          <div className="grid gap-4">
            <ul className="m-0 grid list-none gap-1.5 p-0 text-small">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-4">
                  <span>
                    <span className="num">{l.qty} ×</span> {l.name}
                    {l.variantName && <span className="text-ink-3"> ({l.variantName})</span>}
                  </span>
                  <span className="num">{formatRupees(l.qty * l.unitPricePaise)}</span>
                </li>
              ))}
            </ul>
            <Link to="/" className="-my-2 inline-flex min-h-11 items-center justify-self-start text-small font-semibold text-accent-text">
              Edit items
            </Link>
            <TextArea
              label="Note for the kitchen"
              hint="Optional. For example: less spicy, no onion."
              value={cart.note}
              onChange={(e) => cart.setNote(e.target.value)}
              maxLength={300}
              rows={2}
            />
            <FreeDeliveryNudge bill={bill} pricing={data.pricing} />
            <BillSummary bill={bill} pricing={data.pricing} />
          </div>
        </Step>
      </ol>

      <div className="mt-8 grid gap-3">
        {error && (
          <div ref={errorRef} tabIndex={-1} className="outline-none">
            <Notice tone="danger" title="The order was not placed." live>
              {error}
            </Notice>
          </div>
        )}
        {paused && (
          <Notice tone="warn" title="We are not taking delivery orders right now.">
            {data.restaurant.pausedMessage}
          </Notice>
        )}
        <Button
          variant="accent"
          size="lg"
          className="w-full justify-between"
          busy={placing}
          disabled={!signedIn || !addressId || adding || paused}
          onClick={() => void place()}
        >
          <span>{payment === "online" ? "Place order and pay" : "Place order"}</span>
          <span className="num">{formatRupees(bill.totalPaise)}</span>
        </Button>
        <p className="m-0 text-center text-small text-ink-2">
          The restaurant calls you to confirm before cooking. Food is usually ready in about {data.restaurant.prepTimeMinutes} minutes.
        </p>
      </div>
      {pinFor && (
        <PinDialog
          address={pinFor}
          onClose={() => setPinFor(null)}
          onSaved={(a) => {
            addrs.setData((list) => list?.map((x) => (x.id === a.id ? a : x)));
            setPinFor(null);
          }}
        />
      )}
    </PagePanel>
  );
}

/** Adds or changes the map pin of a saved address without retyping it. */
function PinDialog({ address, onClose, onSaved }: { address: Address; onClose: () => void; onSaved: (a: Address) => void }) {
  const [pin, setPin] = useState<Pin>({ lat: address.lat, lng: address.lng, accuracyM: address.accuracyM });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function save() {
    if (pin.lat === null || pin.lng === null) return setError("Use your current location or tap the map first.");
    setBusy(true);
    setError(undefined);
    try {
      const { id: _id, ...rest } = address;
      void _id;
      const r = await api<{ address: Address }>(`/me/addresses/${address.id}`, { method: "PUT", body: { ...rest, ...pin } });
      onSaved(r.address);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Map location for ${address.label || "this address"}`}
      description={addressLines(address)}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={busy} onClick={() => void save()}>
            Save location
          </Button>
        </div>
      }
    >
      <LocationPicker value={pin} onChange={setPin} error={error} />
    </Dialog>
  );
}

function Step({ n, title, children, disabled }: { n: number; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <li className={cn("grid gap-3", disabled && "opacity-60")}>
      <h2 className="m-0 flex items-center gap-3 font-display text-title font-semibold">
        <span
          aria-hidden="true"
          className="num inline-flex size-7 items-center justify-center rounded-pill bg-brand font-sans text-small font-semibold text-on-brand"
        >
          {n}
        </span>
        {title}
      </h2>
      <div className="sm:pl-10">{children}</div>
    </li>
  );
}

function Choice({
  name,
  checked,
  onChange,
  icon,
  title,
  detail,
  disabled,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  icon: IconName;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-14 items-start gap-3 rounded-md border px-4 py-3",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        checked ? "border-brand bg-paper-sunken" : "border-line hover:border-line-strong",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} disabled={disabled} className="mt-1 size-4 accent-[var(--brand)]" />
      <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-ink-2" />
      <span className="grid gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-small text-ink-2">{detail}</span>
      </span>
    </label>
  );
}
