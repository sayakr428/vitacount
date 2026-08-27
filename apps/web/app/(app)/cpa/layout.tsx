import Link from "next/link";

export default function CpaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">CPA Mode</h1>
        <nav className="flex gap-4 text-sm">
          <Link href="/cpa/accounts" className="hover:underline">
            Chart of Accounts
          </Link>
          <Link href="/cpa/journal-entries" className="hover:underline">
            Journal Entries
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
