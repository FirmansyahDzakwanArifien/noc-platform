import { SignupForm } from "./signup-form";

export const metadata = { title: "Daftar" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SignupForm next={next ?? "/"} />;
}
