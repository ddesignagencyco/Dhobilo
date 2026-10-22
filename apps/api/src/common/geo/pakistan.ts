/** Rough bounding box of Pakistan; catches swapped lat/lng and pins dropped on the wrong continent. */
export const PAKISTAN_BOUNDS = { minLat: 23.5, maxLat: 37.2, minLng: 60.8, maxLng: 77.9 } as const;

export function isInPakistan(lat: number, lng: number): boolean {
  const b = PAKISTAN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}
