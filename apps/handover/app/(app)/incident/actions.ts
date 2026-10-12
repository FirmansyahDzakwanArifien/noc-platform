"use server";

import { revalidatePath } from "next/cache";
import { actionContext, dbError, done, fail, req, str } from "@noc/supabase/actions";
import { INCIDENT_STATUSES, isOneOf, PRIORITIES } from "@/lib/constants";
import { wibToIso } from "@/lib/util";

export async function createIncident(formData: FormData) {
  const back = "/incident";
  const { supabase, auth } = await actionContext(back, "incident.manage");
  const severity = str(formData, "severity") ?? "medium";
  if (!isOneOf(PRIORITIES, severity)) fail(back, "Severity tidak valid.");
  const startedRaw = str(formData, "started_at");
  const startedAt = wibToIso(startedRaw);
  if (startedRaw && !startedAt) fail(back, "Waktu mulai tidak valid.");

  const { data, error } = await supabase
    .from("incidents")
    .insert({
      title: req(formData, "title", back, "Judul"),
      description: str(formData, "description"),
      site_id: str(formData, "site_id"),
      severity,
      affected_service: str(formData, "affected_service"),
      external_ticket: str(formData, "external_ticket"),
      reported_by: auth.userId,
      assigned_to: str(formData, "assigned_to"),
      ...(startedAt ? { started_at: startedAt } : {}),
    })
    .select("id")
    .single();
  if (error || !data) fail(back, dbError(error));
  revalidatePath(back);
  done(`/incident/${(data as { id: string }).id}`, "Incident dibuat.");
}

/** Status baru → nilai resolved_at yang sesuai. */
function resolvedPatch(status: string, current: string | null) {
  if (status === "resolved") return { resolved_at: new Date().toISOString() };
  if (status === "closed") return { resolved_at: current ?? new Date().toISOString() };
  return { resolved_at: null };
}

export async function addIncidentUpdate(formData: FormData) {
  const id = req(formData, "incident_id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase, auth } = await actionContext(back, "incident.manage");
  const content = req(formData, "content", back, "Isi update");
  const status = str(formData, "status");
  if (status !== null && !isOneOf(INCIDENT_STATUSES, status)) fail(back, "Status tidak valid.");

  const { data: inc, error: incErr } = await supabase.from("incidents").select("status, resolved_at").eq("id", id).maybeSingle();
  if (incErr) fail(back, dbError(incErr));
  if (!inc) fail(back, "Incident tidak ditemukan.");
  const current = inc as { status: string; resolved_at: string | null };
  const changed = status !== null && status !== current.status;

  const { error } = await supabase
    .from("incident_updates")
    .insert({ incident_id: id, content, status: changed ? status : null, created_by: auth.userId });
  if (error) fail(back, dbError(error));

  if (changed && status) {
    const { error: upErr } = await supabase
      .from("incidents")
      .update({ status, ...resolvedPatch(status, current.resolved_at) })
      .eq("id", id);
    if (upErr) fail(back, dbError(upErr));
  }
  revalidatePath(back);
  revalidatePath("/incident");
  done(back, changed ? "Update ditambahkan dan status diubah." : "Update ditambahkan.");
}

export async function updateIncident(formData: FormData) {
  const id = req(formData, "id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase } = await actionContext(back, "incident.manage");
  const severity = str(formData, "severity") ?? "medium";
  if (!isOneOf(PRIORITIES, severity)) fail(back, "Severity tidak valid.");

  const { error } = await supabase
    .from("incidents")
    .update({
      severity,
      assigned_to: str(formData, "assigned_to"),
      affected_service: str(formData, "affected_service"),
      external_ticket: str(formData, "external_ticket"),
      root_cause: str(formData, "root_cause"),
      resolution: str(formData, "resolution"),
    })
    .eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath(back);
  revalidatePath("/incident");
  done(back, "Incident diperbarui.");
}

export async function deleteIncident(formData: FormData) {
  const id = req(formData, "id", "/incident", "Incident");
  const back = `/incident/${id}`;
  const { supabase } = await actionContext(back, "incident.delete");
  const { error } = await supabase.from("incidents").delete().eq("id", id);
  if (error) fail(back, dbError(error));
  revalidatePath("/incident");
  done("/incident", "Incident dihapus.");
}
