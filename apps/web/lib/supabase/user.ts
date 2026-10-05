import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string | null };

/**
 * The signed-in user for this request, from the verified access-token JWT.
 *
 * `auth.getUser()` makes a round trip to the Auth server on every call
 * (~300ms–1s from here) and the layout, page and proxy each called it.
 * The project signs JWTs with an asymmetric (ES256) key, so `getClaims()`
 * verifies the signature and expiry locally against the cached JWKS — no
 * network hop. `cache()` dedupes it across one server render.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** The user's profile row; shared by the layout (sidebar) and the dashboard greeting. */
export const getCurrentProfile = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).single();
  return data;
});
