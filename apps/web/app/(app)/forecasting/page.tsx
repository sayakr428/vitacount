import { TrendingUp, Sparkles } from "lucide-react";

export default function ForecastingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Financial Scenario Forecasting</h1>
        <p className="text-xs text-muted-foreground">
          AI-powered cash flow runway modeling, revenue projections, and scenario planning.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-12 text-center shadow-xs">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
          <TrendingUp className="h-6 w-6" />
        </div>
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-[11px] font-bold text-indigo-500">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Pro Plan Module</span>
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">AI Cash Flow Forecasting</h2>
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          Predictive 13-week cash runway modeling, scenario planning (Best case / Worst case), and AI budget variance analysis.
        </p>
      </div>
    </div>
  );
}
