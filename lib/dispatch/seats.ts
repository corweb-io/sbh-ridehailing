import type { LicensedTaxi } from "../licensed-taxis";

const VAN_NAMES = ["staria", "class v", "classe v", "v-class", "v class"];

export function taxiSeats(taxi: Pick<LicensedTaxi, "vehicle">): number {
  const vehicle = taxi.vehicle?.toLowerCase() ?? "";
  if (!vehicle) return 4;
  if (VAN_NAMES.some((name) => vehicle.includes(name))) return 7;
  if (vehicle.includes("range rover")) return 5;
  return 4;
}

export function taxiFitsParty(
  taxi: Pick<LicensedTaxi, "vehicle">,
  pax: number,
) {
  return taxiSeats(taxi) >= pax;
}
