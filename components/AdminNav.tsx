import Link from "next/link";

export function AdminNav({
  current,
}: {
  current: "demand" | "dispatch";
}) {
  const item = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-ink text-shell" : "text-ink-muted hover:bg-sunk"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="flex flex-wrap gap-2">
      {item("/admin", "Demande app", current === "demand")}
      {item("/admin/dispatch", "Dispatch WhatsApp", current === "dispatch")}
    </nav>
  );
}
