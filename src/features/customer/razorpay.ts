import type { RazorpayCheckout } from "../../../shared/types";

type SuccessResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayCtor = new (options: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: unknown) => void) => void };

let loading: Promise<RazorpayCtor> | null = null;

function loadScript(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Payment window did not load.")));
    s.onerror = () => {
      loading = null;
      reject(new Error("The payment window could not load. Check your connection, or choose pay on delivery."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay Checkout. Resolves with the signed response, or null if the customer closed it. */
export async function openRazorpay(rz: RazorpayCheckout): Promise<SuccessResponse | null> {
  const Razorpay = await loadScript();
  return new Promise((resolve) => {
    const checkout = new Razorpay({
      key: rz.keyId,
      order_id: rz.razorpayOrderId,
      amount: rz.amountPaise,
      currency: "INR",
      name: rz.name,
      description: "Food order",
      prefill: { name: rz.prefill.name, contact: rz.prefill.contact },
      theme: { color: "#6b1f2a" },
      handler: (r: SuccessResponse) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.on("payment.failed", () => {
      /* Razorpay shows its own retry UI; dismissal resolves null. */
    });
    checkout.open();
  });
}
