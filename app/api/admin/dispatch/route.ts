import { getDispatchStats, isAdminAuthorized } from "@/lib/admin";
import { noStoreJson, rateLimit } from "@/lib/api";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin:dispatch", 20, 60_000);
  if (limited) return limited;

  if (!isAdminAuthorized(request)) {
    return noStoreJson({ error: "Non autorisé." }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    const stats = await getDispatchStats(
      url.searchParams.get("range"),
      url.searchParams.get("channel"),
    );
    return noStoreJson(stats);
  } catch (error) {
    console.error("admin_dispatch_stats_failed", { error });
    return noStoreJson(
      { error: "Impossible de charger les statistiques." },
      { status: 500 },
    );
  }
}
