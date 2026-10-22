import { boundingBox, haversineKm } from './haversine';

describe('haversineKm', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(31.52, 74.35, 31.52, 74.35)).toBe(0);
    expect(haversineKm(31.52, 74.35, 24.86, 67.0)).toBeCloseTo(haversineKm(24.86, 67.0, 31.52, 74.35), 9);
  });

  it('matches known city distances', () => {
    // Lahore <-> Karachi is about 1,030 km by air
    expect(haversineKm(31.5204, 74.3587, 24.8607, 67.0011)).toBeGreaterThan(1000);
    expect(haversineKm(31.5204, 74.3587, 24.8607, 67.0011)).toBeLessThan(1060);
    // one degree of latitude is about 111 km
    expect(haversineKm(30, 70, 31, 70)).toBeCloseTo(111.19, 1);
  });
});

describe('boundingBox', () => {
  it('contains every point within the radius', () => {
    const box = boundingBox(31.52, 74.35, 10);
    for (const [dLat, dLng] of [[0.09, 0], [-0.09, 0], [0, 0.105], [0, -0.105], [0.06, 0.07]]) {
      const lat = 31.52 + dLat;
      const lng = 74.35 + dLng;
      if (haversineKm(31.52, 74.35, lat, lng) <= 10) {
        expect(lat).toBeGreaterThanOrEqual(box.minLat);
        expect(lat).toBeLessThanOrEqual(box.maxLat);
        expect(lng).toBeGreaterThanOrEqual(box.minLng);
        expect(lng).toBeLessThanOrEqual(box.maxLng);
      }
    }
  });
});
