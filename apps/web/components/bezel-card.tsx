export function BezelCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06] ${className}`}>
      <div className="h-full rounded-xl bg-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        {children}
      </div>
    </div>
  );
}
