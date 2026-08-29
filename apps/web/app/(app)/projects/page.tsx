import { FolderKanban } from "lucide-react";

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Project profitability, job budgets, and billable time across your clients.
        </p>
      </div>

      <div className="rounded-2xl bg-foreground/[0.03] p-1.5 ring-1 ring-foreground/[0.06]">
        <div className="flex flex-col items-center justify-center rounded-xl bg-card p-12 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderKanban className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-heading text-lg font-semibold text-foreground">Project accounting & job costing</h2>
          <p className="mt-2 max-w-md text-xs text-muted-foreground">
            Multi-project job cost tracking, employee billable hours, and milestone invoicing — coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
