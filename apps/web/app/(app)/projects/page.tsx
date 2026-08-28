import { FolderKanban, Sparkles } from "lucide-react";

export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Project Accounting & Job Costing</h1>
        <p className="text-xs text-muted-foreground">
          Track project profitability, job budgets, and billable time across your clients.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FolderKanban className="h-6 w-6" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Growth Plan Module</span>
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Projects & Job Costing Engine</h2>
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          Multi-project job cost tracking, employee billable hours, and milestone invoicing are available on the Growth & Enterprise plans.
        </p>
      </div>
    </div>
  );
}
