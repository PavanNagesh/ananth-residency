import { useMemo } from "react";
import { renderSVG } from "uqr";
import { buttonClasses } from "../../components/ui/button-classes";
import { Icon } from "../../components/ui/icons";
import { Button } from "../../components/ui/primitives";
import { useToast } from "../../lib/toast";

/**
 * Everything the restaurant needs to send customers to the ordering site:
 * a QR code to print on menus, bills and the counter, the link, and a WhatsApp share.
 */
export function ShareOrderingLink({ restaurantName }: { restaurantName: string }) {
  const toast = useToast();
  const url = window.location.origin + "/";
  const message = `Order from ${restaurantName} online. Free delivery on orders of ₹500 and above: ${url}`;
  const svg = useMemo(
    () => renderSVG(url, { ecc: "M", border: 2, pixelSize: 10, blackColor: "#2a1b18", whiteColor: "#ffffff" }),
    [url],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.", "ok");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: restaurantName, text: message, url });
      } catch {
        /* closed */
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    }
  }

  function download(type: "svg" | "png") {
    const name = `${restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-order-qr.${type}`;
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const save = (blob: Blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    if (type === "svg") return save(svgBlob);
    // PNG for WhatsApp status and phones that cannot open SVG files.
    const img = new Image();
    img.onload = () => {
      const size = 1200;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      canvas.toBlob((b) => b && save(b), "image/png");
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(svgBlob);
  }

  return (
    <section aria-labelledby="share-h" className="mb-10 grid max-w-2xl gap-5 rounded-md border border-line bg-paper-raised p-5 sm:grid-cols-[11rem_1fr] sm:items-center">
      <figure className="m-0 justify-self-center">
        <div
          role="img"
          aria-label={`QR code that opens ${url}`}
          className="size-44 overflow-hidden rounded-sm bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
          // uqr returns a plain SVG string built from the URL only.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <figcaption className="mt-1 text-center text-label text-ink-3">Scan to order</figcaption>
      </figure>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="share-h" className="m-0 font-display text-title font-semibold">
            Customer ordering link
          </h2>
          <p className="m-0 text-small text-ink-2">
            Print the QR code on menus, bills and the counter, or send the link on WhatsApp instead of the menu photos.
          </p>
        </div>
        <p className="m-0 rounded-sm bg-paper-sunken px-3 py-2 font-mono text-small break-all">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" icon="share" onClick={() => void share()}>
            Share link
          </Button>
          <Button variant="secondary" size="sm" icon="copy" onClick={() => void copy()}>
            Copy link
          </Button>
          <a
            className={buttonClasses("secondary", "sm")}
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="message" size={16} />
            WhatsApp
          </a>
          <Button variant="ghost" size="sm" icon="download" onClick={() => download("png")}>
            QR image
          </Button>
          <Button variant="ghost" size="sm" icon="download" onClick={() => download("svg")}>
            QR for printing
          </Button>
        </div>
      </div>
    </section>
  );
}
