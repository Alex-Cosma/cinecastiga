"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sessionUserId } from "@/lib/session";
import {
  createInvestigation,
  deleteClip,
  deleteInvestigation,
  INV_STATUSES,
  updateClip,
  updateInvestigation,
  type InvStatus,
} from "@/lib/anchete";

async function requireUid(): Promise<string> {
  const uid = await sessionUserId();
  if (!uid) redirect("/login");
  return uid;
}

export async function createAncheta(formData: FormData) {
  const uid = await requireUid();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) redirect("/anchete");
  const id = await createInvestigation(
    uid,
    title.slice(0, 200),
    String(formData.get("description") ?? "").trim() || null,
  );
  redirect(`/anchete/${id}`);
}

export async function deleteAncheta(formData: FormData) {
  const uid = await requireUid();
  await deleteInvestigation(uid, String(formData.get("id") ?? ""));
  revalidatePath("/anchete");
  redirect("/anchete");
}

export async function saveAnchetaMeta(formData: FormData) {
  const uid = await requireUid();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const patch: { title?: string; description?: string | null; status?: InvStatus } = {};
  const title = formData.get("title");
  if (title !== null && String(title).trim()) patch.title = String(title).trim().slice(0, 200);
  const desc = formData.get("description");
  if (desc !== null) patch.description = String(desc).trim() || null;
  if (INV_STATUSES.includes(status as InvStatus)) patch.status = status as InvStatus;
  await updateInvestigation(uid, id, patch);
  revalidatePath(`/anchete/${id}`);
}

export async function saveClipNote(formData: FormData) {
  const uid = await requireUid();
  const id = String(formData.get("id") ?? "");
  await updateClip(uid, id, String(formData.get("clipId") ?? ""), {
    note: String(formData.get("note") ?? "").trim() || null,
  });
  revalidatePath(`/anchete/${id}`);
}

export async function toggleClipPin(formData: FormData) {
  const uid = await requireUid();
  const id = String(formData.get("id") ?? "");
  await updateClip(uid, id, String(formData.get("clipId") ?? ""), {
    pinned: formData.get("pinned") === "true",
  });
  revalidatePath(`/anchete/${id}`);
}

export async function removeClip(formData: FormData) {
  const uid = await requireUid();
  const id = String(formData.get("id") ?? "");
  await deleteClip(uid, id, String(formData.get("clipId") ?? ""));
  revalidatePath(`/anchete/${id}`);
}

export async function addNoteClip(formData: FormData) {
  const uid = await requireUid();
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note) {
    const { addClip } = await import("@/lib/anchete");
    await addClip(uid, id, {
      kind: "note",
      refId: null,
      spec: null,
      note: note.slice(0, 4000),
      clientSnapshot: null,
    });
  }
  revalidatePath(`/anchete/${id}`);
}
