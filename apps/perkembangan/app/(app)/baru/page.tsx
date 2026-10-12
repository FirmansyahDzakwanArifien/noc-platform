import Link from "next/link";
import { requireAuth } from "@noc/supabase/auth";
import { createClient } from "@noc/supabase/server";
import type { Site } from "@noc/supabase/types";
import { buttonClass, Card, CardContent, Flash, Forbidden, PageHeader, SubmitButton } from "@noc/ui";
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
  if (!auth.can("project.create")) return <Forbidden />;

  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("id, code, name").eq("is_active", true).order("code");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Project baru" description="Anda otomatis menjadi pemilik dan lead project ini." />
      <Flash searchParams={sp} />
      <Card>
        <CardContent>
          <form action={createProject} className="space-y-6">
            <ProjectFields sites={(sites ?? []) as Pick<Site, "id" | "code" | "name">[]} />
            <div className="flex flex-wrap justify-end gap-2">
              <Link href="/" className={buttonClass("secondary")}>
                Batal
              </Link>
              <SubmitButton>Buat project</SubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
