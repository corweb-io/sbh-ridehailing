export const SBH_BOUNDS = {
  south: 17.86,
  west: -62.92,
  north: 17.96,
  east: -62.79,
} as const;

export const SBH_CENTER = { lat: 17.9, lng: -62.833 };

export function getAdminSecret(): string | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  return secret && secret.length >= 24 ? secret : null;
}

export function isInsideSbh(lat: number, lng: number): boolean {
  return (
    lat >= SBH_BOUNDS.south &&
    lat <= SBH_BOUNDS.north &&
    lng >= SBH_BOUNDS.west &&
    lng <= SBH_BOUNDS.east
  );
}
