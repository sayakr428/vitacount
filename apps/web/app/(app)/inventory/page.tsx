import { Package, Sparkles } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Inventory & COGS Tracking</h1>
        <p className="text-xs text-muted-foreground">
          Real-time stock tracking, FIFO cost of goods sold, and reorder point alerts.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
          <Package className="h-6 w-6" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Growth Plan Module</span>
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Automated Inventory Management</h2>
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          FIFO perpetual inventory tracking, automated COGS journal posting, and multi-location warehouse management.
        </p>
      </div>
    </div>
  );
}
