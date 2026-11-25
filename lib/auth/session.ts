import { hasPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Gate } from "@/lib/auth/gates";

type GateRow = {
  status: "active" | "inactive";
  must_change_password: boolean;
  profile_completed: boolean;
  is_super_admin: boolean;
  role: "admin" | "sales" | null;
};

export async function getGate(): Promise<Gate | null> {
  if (!hasPublicEnv()) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase.rpc("session_gate");
  if (error || !data) return null;
  const row = data as GateRow;
  return {
    status: row.status,
    mustChangePassword: row.must_change_password,
    profileCompleted: row.profile_completed,
    isSuperAdmin: row.is_super_admin,
    role: row.role,
  };
}

export type Notice = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
};

export async function listNotices(): Promise<Notice[]> {
  if (!hasPublicEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, read_at")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    body: (row.body as string | null) ?? null,
    readAt: (row.read_at as string | null) ?? null,
  }));
}
