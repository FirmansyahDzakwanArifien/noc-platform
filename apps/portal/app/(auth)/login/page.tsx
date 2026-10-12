import { redirect } from "next/navigation";
import { safeNextUrl } from "@noc/supabase/apps";
import { getAuth } from "@noc/supabase/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Masuk" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (!error && (await getAuth())) redirect(safeNextUrl(next));
  return <LoginForm next={next ?? "/"} initialError={error} />;
}
