import { getAdminStats, isAdminAuthorized } from "@/lib/admin";
import { noStoreJson, rateLimit } from "@/lib/api";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin:stats", 20, 60_000);
  if (limited) return limited;

  if (!isAdminAuthorized(request)) {
    return noStoreJson({ error: "Non autorisé." }, { status: 401 });
  }

  try {
    const stats = await getAdminStats();
    return noStoreJson(stats);
  } catch (error) {
    console.error("admin_stats_failed", { error });
    return noStoreJson(
      { error: "Impossible de charger les statistiques." },
      { status: 500 },
    );
  }
}
