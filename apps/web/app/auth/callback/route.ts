import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const tenantId = searchParams.get("tenant_id");
  const next = searchParams.get("next") ?? "/dashboard";

  const supabase = await createClient();

  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  if (!verified) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  if (tenantId) {
    await supabase.rpc("accept_invite", { p_tenant_id: tenantId });
    return NextResponse.redirect(`${origin}/invite/set-password`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
