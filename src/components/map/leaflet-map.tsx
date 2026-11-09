import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

/**
 * OpenStreetMap through Leaflet. Loaded lazily (see ./index.tsx) so the menu does not pay for it.
 * Everything stays inside the page: no new tabs, no external app.
 */
export type LeafletMapProps = {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  /** Accessible name for the map region. */
  label: string;
  /** Pan, zoom and (when onMove is set) drag the pin. Off for small previews in lists. */
  interactive?: boolean;
  /** Called when the pin is dragged or the map is tapped. */
  onMove?: (lat: number, lng: number) => void;
  zoom?: number;
  /** False while no location has been chosen yet: the map shows the area without a pin. */
  showPin?: boolean;
  className?: string;
};

const PIN = `<svg viewBox="0 0 40 52" width="40" height="52" aria-hidden="true">
  <path d="M20 2C10.6 2 3 9.4 3 18.6 3 31 20 50 20 50s17-19 17-31.4C37 9.4 29.4 2 20 2z" fill="#6f1821" stroke="#fff" stroke-width="2.5"/>
  <circle cx="20" cy="18.5" r="6.5" fill="#ebc16b"/>
</svg>`;

const pinIcon = L.divIcon({ className: "ar-map-pin", html: PIN, iconSize: [40, 52], iconAnchor: [20, 50] });

export default function LeafletMap({ lat, lng, accuracyM, label, interactive = true, onMove, zoom = 17, showPin = true, className }: LeafletMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Create once.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, {
      center: [lat, lng],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: false, // never trap the page's own scrolling
      boxZoom: false,
      keyboard: interactive,
      attributionControl: true,
    });
    m.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(m);
    const draggable = interactive && Boolean(onMoveRef.current);
    marker.current = L.marker([lat, lng], { icon: pinIcon, draggable, keyboard: draggable, title: label, alt: label });
    marker.current.on("dragend", () => {
      const p = marker.current!.getLatLng();
      onMoveRef.current?.(p.lat, p.lng);
    });
    if (draggable) {
      m.on("click", (e: L.LeafletMouseEvent) => onMoveRef.current?.(e.latlng.lat, e.latlng.lng));
    }
    map.current = m;
    // Sheets and expanding panels change size after mount: keep tiles filling the box.
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // Options are fixed for the life of the map; position updates are handled below.
  }, []);

  // Follow position and accuracy changes.
  useEffect(() => {
    const m = map.current;
    if (!m || !marker.current) return;
    marker.current.setLatLng([lat, lng]);
    if (showPin && !m.hasLayer(marker.current)) {
      marker.current.addTo(m);
      if (m.getZoom() < 16) m.setView([lat, lng], 17);
    }
    if (!showPin && m.hasLayer(marker.current)) marker.current.remove();
    circle.current?.remove();
    circle.current = null;
    if (showPin && accuracyM && accuracyM > 0 && accuracyM < 2000) {
      circle.current = L.circle([lat, lng], { radius: accuracyM, color: "#6f1821", weight: 1, fillColor: "#6f1821", fillOpacity: 0.08, interactive: false }).addTo(m);
    }
    if (!m.getBounds().pad(-0.2).contains([lat, lng])) m.panTo([lat, lng]);
  }, [lat, lng, accuracyM, showPin]);

  return (
    <div
      ref={el}
      role="region"
      aria-label={label}
      // isolate: Leaflet's internal z-indexes stay inside the map, under toasts and headers.
      className={`relative isolate z-0 overflow-hidden rounded-sm border border-line bg-paper-sunken ${className ?? ""}`}
    />
  );
}
