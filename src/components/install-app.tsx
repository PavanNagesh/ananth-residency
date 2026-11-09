import { useState } from "react";
import { useInstall } from "../lib/install";
import { storage } from "../lib/storage";
import { cn } from "./ui/cn";
import { Icon } from "./ui/icons";
import { Button, Dialog, IconButton } from "./ui/primitives";

/** Shows the browser's install dialog, or the Safari steps on iPhone/iPad. Renders nothing when not possible. */
export function InstallButton({
  label = "Add to home screen",
  appName = "Ananth Residency",
  variant = "secondary",
  className,
}: {
  label?: string;
  appName?: string;
  variant?: "secondary" | "on-brand" | "primary";
  className?: string;
}) {
  const install = useInstall();
  const [steps, setSteps] = useState(false);
  if (!install.canPrompt && !install.needsIOSSteps) return null;
  return (
    <>
      <Button
        variant={variant}
        size="sm"
        icon="addSquare"
        className={className}
        onClick={() => (install.canPrompt ? void install.prompt() : setSteps(true))}
      >
        {label}
      </Button>
      <IOSSteps open={steps} onClose={() => setSteps(false)} appName={appName} />
    </>
  );
}

function IOSSteps({ open, onClose, appName }: { open: boolean; onClose: () => void; appName: string }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add to your home screen"
      description={`Open ${appName} with one tap, like an app.`}
      footer={
        <Button variant="primary" className="w-full" onClick={onClose}>
          Done
        </Button>
      }
    >
      <ol className="m-0 grid list-none gap-4 p-0">
        {[
          { icon: "share" as const, text: <>Tap the <strong>Share</strong> button in Safari’s toolbar.</> },
          { icon: "addSquare" as const, text: <>Scroll down and choose <strong>Add to Home Screen</strong>.</> },
          { icon: "check" as const, text: <>Tap <strong>Add</strong>. The icon appears on your home screen.</> },
        ].map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="num inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-brand text-small font-semibold text-on-brand"
            >
              {i + 1}
            </span>
            <span className="flex flex-1 items-start justify-between gap-3 pt-0.5">
              <span>{s.text}</span>
              <Icon name={s.icon} size={22} className="shrink-0 text-ink-2" />
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}

const DISMISS_KEY = "ar.install.dismissed";

/**
 * A quiet suggestion for returning customers on phones: shown only after a first order,
 * when the device can install, and until dismissed.
 */
export function InstallBanner({ className, force }: { className?: string; force?: boolean }) {
  const install = useInstall();
  const [hidden, setHidden] = useState(() => storage.get<boolean>(DISMISS_KEY, false));
  const ordered = force || storage.get<boolean>("ar.hasOrdered", false);
  if (hidden || !ordered || (!install.canPrompt && !install.needsIOSSteps)) return null;
  return (
    <div className={cn("flex items-center gap-3 rounded-md border border-line bg-paper-raised px-4 py-3", className)}>
      <Icon name="smartphone" size={22} className="shrink-0 text-accent-text" />
      <p className="m-0 flex-1 text-small text-ink-2">
        <span className="font-semibold text-ink">Order faster next time.</span> Keep Ananth Residency on your home screen.
      </p>
      <InstallButton label="Add" />
      <IconButton
        icon="x"
        label="Not now"
        onClick={() => {
          storage.set(DISMISS_KEY, true);
          setHidden(true);
        }}
      />
    </div>
  );
}
