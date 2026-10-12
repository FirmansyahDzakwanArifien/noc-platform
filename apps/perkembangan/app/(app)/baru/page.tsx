import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Site } from "@noc/supabase/types";
import { buttonClass, Card, CardContent, Flash, Forbidden, PageHeader, SubmitButton } from "@noc/ui";
import { ArrowLeft } from "lucide-react";
import { ProjectFields } from "@/components/project-fields";
import { createProject } from "./actions";

export const metadata = { title: "Project baru" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const sp = await searchParams;
  const auth = await requireAuth();
  if (!auth.can("project.create")) return <Forbidden message="Anda tidak memiliki izin untuk membuat project." />;

  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("id, code, name").eq("is_active", true).order("code");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Semua project
      </Link>
      <PageHeader
        title="Project baru"
        description="Isi data dasar project. Task, milestone, dan anggota ditambahkan setelah project dibuat — Anda otomatis menjadi pemilik dan ketua."
      />
      <Flash searchParams={sp} />
      <Card>
        <CardContent>
          <form action={createProject} className="space-y-6">
            <ProjectFields sites={(sites ?? []) as Pick<Site, "id" | "code" | "name">[]} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                <span className="text-red-500">*</span> wajib diisi
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/" className={buttonClass("secondary")}>
                  Batal
                </Link>
                <SubmitButton pendingText="Membuat…">Buat project</SubmitButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
