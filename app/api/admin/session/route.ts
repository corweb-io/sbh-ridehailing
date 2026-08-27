import { isAdminAuthorized } from "@/lib/admin";
import { noStoreJson, rateLimit } from "@/lib/api";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin:session", 20, 60_000);
  if (limited) return limited;

  if (!isAdminAuthorized(request)) {
    return noStoreJson({ error: "Non autorisé." }, { status: 401 });
  }

  return noStoreJson({ ok: true });
}
