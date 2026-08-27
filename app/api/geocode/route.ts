import { noStoreJson, rateLimit } from "@/lib/api";
import { isInsideSbh } from "@/lib/config";
import { reverseGeocode } from "@/lib/geo";

export async function GET(request: Request) {
  const limited = rateLimit(request, "geocode:reverse", 20, 60_000);
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return noStoreJson({ error: "Coordonnées invalides." }, { status: 400 });
  }
  if (!isInsideSbh(lat, lng)) {
    return noStoreJson(
      { error: "La position doit être située à Saint-Barthélemy." },
      { status: 400 },
    );
  }

  try {
    const address = await reverseGeocode({ lat, lng });
    return noStoreJson({
      onIsland: true,
      address: address ?? "Position actuelle",
      lat,
      lng,
    });
  } catch (error) {
    console.error("reverse_geocode_failed", { error });
    return noStoreJson({
      onIsland: true,
      address: "Position actuelle",
      lat,
      lng,
    });
  }
}
