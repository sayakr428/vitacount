import { Package } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Inventory</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Real-time stock tracking, FIFO cost of goods sold, and reorder point alerts.
        </p>
      </div>

      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="flex flex-col items-center justify-center rounded-xl bg-card p-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-positive/10 text-positive">
            <Package className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-heading text-lg font-semibold text-foreground">Automated inventory management</h2>
          <p className="mt-2 max-w-md text-xs text-muted-foreground">
            FIFO perpetual inventory tracking, automated COGS journal posting, and multi-location warehouse management — coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
