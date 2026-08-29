import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-heading text-base font-semibold tracking-tight text-foreground">
          <LogoMark className="size-7" />
          VitaCount
        </Link>
        {children}
      </div>
    </div>
  );
}
