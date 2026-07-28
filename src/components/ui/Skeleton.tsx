export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-bg-hover rounded-btn ${className}`} />;
}

export function KPISkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function CardSkeleton({ className = "h-24" }: { className?: string }) {
  return (
    <div className="bg-bg-card border border-border rounded-card px-4 md:px-6 py-4 md:py-5">
      <Skeleton className={className} />
    </div>
  );
}
