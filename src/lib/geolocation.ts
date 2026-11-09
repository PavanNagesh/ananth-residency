export type Fix = { lat: number; lng: number; accuracyM: number };

/** Asks the browser for the device's location (the browser shows its own permission prompt). */
export function currentLocation(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("This browser cannot share your location. Tap the map to place your pin instead."));
      return;
    }
    if (!window.isSecureContext) {
      reject(new Error("Location needs a secure (https) connection. Tap the map to place your pin instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      (e) => {
        if (e.code === e.PERMISSION_DENIED) {
          reject(new Error("Location is blocked for this site. Allow it from the lock icon next to the address bar, or tap the map to place your pin."));
        } else if (e.code === e.TIMEOUT) {
          reject(new Error("Finding your location took too long. Try again near a window, or tap the map to place your pin."));
        } else {
          reject(new Error("Your phone could not find your location. Turn on location services, or tap the map to place your pin."));
        }
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
    );
  });
}

/** Hubballi city centre: where the map opens before a pin is placed. */
export const HUBBALLI = { lat: 15.3647, lng: 75.124 };

export function accuracyText(accuracyM: number | null | undefined) {
  if (accuracyM === null || accuracyM === undefined) return "Pin placed by hand on the map.";
  if (accuracyM <= 30) return `From the phone's GPS, accurate to about ${accuracyM} m.`;
  if (accuracyM <= 200) return `From the phone's location, accurate to about ${accuracyM} m. Check the landmark too.`;
  return `Approximate location only (about ${Math.round(accuracyM / 100) / 10} km). Rely on the address and landmark.`;
}
