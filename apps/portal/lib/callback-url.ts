/** URL callback auth (magic link, OAuth, verifikasi email, reset password) di portal. */
export function callbackUrl(next: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}
