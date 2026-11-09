import { lazy, Suspense, useState } from "react";
import { accuracyText, currentLocation, HUBBALLI, type Fix } from "../../lib/geolocation";
import { cn } from "../ui/cn";
import { Button, Notice, Spinner } from "../ui/primitives";
import type { LeafletMapProps } from "./leaflet-map";

const LeafletMap = lazy(() => import("./leaflet-map"));

/** A map with a pin. Leaflet and the map tiles load only when one is shown. */
export function MapView({ height = 200, className, ...props }: LeafletMapProps & { height?: number | string }) {
  return (
    <Suspense
      fallback={
        <div
          role="status"
          className={cn("flex items-center justify-center gap-2 rounded-sm border border-line bg-paper-sunken text-small text-ink-2", className)}
          style={{ height }}
        >
          <Spinner /> Loading map…
        </div>
      }
    >
      <div style={{ height }} className={className}>
        <LeafletMap {...props} className="h-full w-full" />
      </div>
    </Suspense>
  );
}

export type Pin = { lat: number | null; lng: number | null; accuracyM: number | null };

/**
 * Customer location step: "Use my current location" asks the browser for GPS, then the pin
 * can be dragged (or the map tapped) to the exact door. Placing it by hand also works.
 */
export function LocationPicker({ value, onChange, error }: { value: Pin; onChange: (p: Pin) => void; error?: string }) {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const hasPin = value.lat !== null && value.lng !== null;

  async function locate() {
    setLocating(true);
    setProblem(null);
    try {
      const fix: Fix = await currentLocation();
      onChange(fix);
    } catch (e) {
      setProblem((e as Error).message);
      setManual(true);
    } finally {
      setLocating(false);
    }
  }

  return (
    <fieldset className="m-0 grid gap-3 rounded-md border border-line p-4" aria-describedby="loc-hint">
      <legend className="px-1 text-small font-semibold">Map location</legend>
      <p id="loc-hint" className="m-0 text-small text-ink-2">
        Share where you are so the restaurant can see your door on a map. It is saved with this address only.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant={hasPin ? "secondary" : "primary"} size="sm" icon="pin" busy={locating} onClick={() => void locate()}>
          {hasPin ? "Use my current location again" : "Use my current location"}
        </Button>
        {!hasPin && !manual && (
          <Button variant="ghost" size="sm" onClick={() => setManual(true)}>
            Choose on the map
          </Button>
        )}
        {hasPin && (
          <Button variant="ghost" size="sm" onClick={() => onChange({ lat: null, lng: null, accuracyM: null })}>
            Remove pin
          </Button>
        )}
      </div>
      {problem && (
        <Notice tone="warn" live>
          {problem}
        </Notice>
      )}
      {(hasPin || manual) && (
        <>
          <MapView
            height={240}
            lat={value.lat ?? HUBBALLI.lat}
            lng={value.lng ?? HUBBALLI.lng}
            accuracyM={value.accuracyM}
            zoom={hasPin ? 17 : 13}
            showPin={hasPin}
            label="Map: drag the pin or tap to set your delivery location"
            onMove={(lat, lng) => onChange({ lat, lng, accuracyM: null })}
          />
          <p className="m-0 text-small text-ink-2" role="status">
            {hasPin ? <>Drag the pin or tap the map to fine-tune. {accuracyText(value.accuracyM)}</> : "Tap the map where your home is."}
          </p>
        </>
      )}
      {error && <p className="m-0 text-small font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
