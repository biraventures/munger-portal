/**
 * Best-effort browser GPS capture for fault reporting - builds up a
 * location record of faulty streetlights over time. Never throws:
 * if the browser doesn't support geolocation, the user denies
 * permission, or it times out, this resolves to null rather than
 * blocking the report itself.
 */
export function getCurrentGpsPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}
