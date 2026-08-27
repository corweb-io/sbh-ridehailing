export function TripRoute({
  pickup,
  destination,
}: {
  pickup: string;
  destination: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-4 shrink-0 flex-col items-center">
        <span className="border-ink mt-1 h-2.5 w-2.5 rounded-full border-2" />
        <span className="border-line-strong my-1.5 h-7 w-px border-l border-dashed" />
        <span className="bg-coral-bright h-2.5 w-2.5 rounded-sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pickup}</p>
        <div className="bg-line my-3 h-px" />
        <p className="truncate text-sm font-medium">{destination}</p>
      </div>
    </div>
  );
}
