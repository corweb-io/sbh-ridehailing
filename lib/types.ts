export type RideStatus =
  | "started"
  | "quote_viewed"
  | "requested"
  | "confirmed"
  | "searching"
  | "no_driver"
  | "cancelled";

export type UserType = "resident" | "worker" | "visitor";

export type FareBand = "day" | "evening" | "night";

export type FareZoneId =
  | "airport"
  | "gustavia"
  | "la-pointe"
  | "saint-jean"
  | "lorient"
  | "vitet"
  | "devet"
  | "marigot"
  | "pointe-milou"
  | "grand-cul-de-sac"
  | "toiny"
  | "grand-fond"
  | "saline"
  | "public"
  | "corossol"
  | "lurin"
  | "gouverneur"
  | "flamands"
  | "anse-des-cayes"
  | "colombier"
  | "ti-morne";

export type LatLng = {
  lat: number;
  lng: number;
};

export type LocationSource = "catalog" | "google" | "gps" | "custom";

export type Place = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  source?: LocationSource;
  fareZone?: FareZoneId | null;
};

export type PlaceSuggestion = Place & { placeId?: string };

export type FunnelEventName =
  | "landing_view"
  | "ride_started"
  | "pickup_selected"
  | "destination_selected"
  | "quote_generated"
  | "taxi_requested"
  | "whatsapp_clicked"
  | "stand_called"
  | "pickup_confirmation_started"
  | "pickup_confirmed"
  | "driver_search_started"
  | "no_driver_shown"
  | "contact_submitted"
  | "app_install_clicked"
  | "pwa_install_accepted"
  | "pwa_install_dismissed"
  | "ios_install_instructions_shown"
  | "bookmark_instructions_shown"
  | "pwa_opened"
  | "cancelled";

export type FunnelEvent = {
  name: FunnelEventName;
  at: string;
  meta?: Record<string, unknown>;
};

export type SmokeTestRide = {
  id: string;
  session_id: string;
  created_at: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  pickup_address: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_address: string | null;
  distance_km: number | null;
  estimated_duration_minutes: number | null;
  quoted_price: number | null;
  fare_zone_from: FareZoneId | null;
  fare_zone_to: FareZoneId | null;
  fare_band: FareBand | null;
  pricing_variant: string | null;
  status: RideStatus;
  started_at: string | null;
  quote_viewed_at: string | null;
  pickup_confirmed_at: string | null;
  requested_at: string | null;
  search_started_at: string | null;
  completed_at: string | null;
  contact: string | null;
  first_name: string | null;
  user_type: UserType | null;
  acquisition_source: string | null;
  events: FunnelEvent[];
};

export type SmokeTestEvent = {
  id: string;
  session_id: string;
  ride_id: string | null;
  name: FunnelEventName;
  created_at: string;
  meta?: Record<string, unknown>;
};

export type FareQuote = {
  zoneFrom: FareZoneId | null;
  zoneTo: FareZoneId | null;
  fareBand: FareBand;
  daytimeFare: number | null;
  surcharge: number;
  fare: number | null;
};

export type QuoteResult = FareQuote & {
  distanceKm: number | null;
  durationMinutes: number | null;
  route: [number, number][];
  departAt: string;
};

export type RidePatch = Partial<
  Omit<SmokeTestRide, "id" | "session_id" | "created_at" | "events">
> & {
  event?: FunnelEventName;
  eventMeta?: Record<string, unknown>;
};
