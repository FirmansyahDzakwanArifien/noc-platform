import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { PORTAL_URL } from "./env";
import { createClient } from "./server";
import type { Profile } from "./types";

export type Auth = {
  userId: string;
  email: string;
  profile: Profile | null;
  permissions: string[];
  roles: string[];
  can: (perm: string) => boolean;
};

/** User yang sedang login + permission-nya. Di-cache per request. */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const supabase = await createClient();
  // JWT diverifikasi lokal (ES256 + JWKS), tidak memanggil server Auth seperti getUser().
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? "" };

  const [{ data: profile }, { data: perms }, { data: roleRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.rpc("my_permissions"),
    supabase.from("user_roles").select("roles(key)").eq("user_id", user.id),
  ]);

  const permissions = ((perms as string[] | null) ?? []).slice().sort();
  const permSet = new Set(permissions);
  const roles = ((roleRows ?? []) as unknown as { roles: { key: string } | null }[])
    .map((r) => r.roles?.key)
    .filter((k): k is string => !!k);

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: (profile as Profile | null) ?? null,
    permissions,
    roles,
    can: (perm: string) => permSet.has(perm),
  };
});

/** Wajib login. Middleware sudah menangani redirect, ini lapis kedua. */
export async function requireAuth(): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) redirect(`${PORTAL_URL}/login`);
  return auth;
}
