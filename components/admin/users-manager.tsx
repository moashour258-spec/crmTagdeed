"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  changeRoleAction,
  changeStatusAction,
  provisionUserAction,
  renameUserAction,
  resetPasswordAction,
  revealNationalIdAction,
} from "@/app/(workspace)/users/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";

export type DirectoryUser = {
  id: string;
  email: string;
  full_name: string | null;
  status: "active" | "inactive";
  role: "admin" | "sales";
  is_super_admin: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  national_id_masked: string | null;
};

export function UsersManager({ users, isSuperAdmin }: { users: DirectoryUser[]; isSuperAdmin: boolean }) {
  const t = useTranslations("users");
  const roles = useTranslations("roles");
  const status = useTranslations("accountStatus");
  const auth = useTranslations("auth");
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "sales">("sales");
  const [method, setMethod] = useState<"invitation" | "random_password" | "custom_password">("invitation");
  const [password, setPassword] = useState("");
  const [temporary, setTemporary] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [editing, setEditing] = useState<DirectoryUser | null>(null);
  const [pending, setPending] = useState(false);

  function done(result: { ok: boolean; error?: string; temporaryPassword?: string; nationalId?: string }) {
    setPending(false);
    if (!result.ok) {
      toast.push({ title: result.error ?? "حدث خطأ، حاول مرة أخرى", tone: "danger" });
      return false;
    }
    if (result.temporaryPassword) setTemporary(result.temporaryPassword);
    if (result.nationalId) setRevealed(result.nationalId);
    router.refresh();
    return true;
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>{t("addUser")}</Button>
      </div>
      {users.length === 0 ? <p className="text-sm text-muted">لا يوجد مستخدمون بعد.</p> : null}
      <div className="grid gap-3">
        {users.map((user) => (
          <article key={user.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{user.full_name ?? user.email}</p>
                <p className="text-sm text-muted">{user.email}</p>
                <p className="text-sm text-muted">
                  {user.is_super_admin ? roles("super_admin") : roles(user.role)} · {status(user.status)} · {t("registeredAt")} {formatDateTime(new Date(user.created_at))}
                  {user.national_id_masked ? ` · ${user.national_id_masked}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(user)}>تعديل</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    setPending(true);
                    const result = await revealNationalIdAction(user.id);
                    done(result);
                  }}
                >
                  الرقم القومي
                </Button>
                <Button
                  size="sm"
                  variant={user.status === "active" ? "danger" : "secondary"}
                  disabled={pending || user.is_super_admin}
                  onClick={async () => {
                    setPending(true);
                    done(await changeStatusAction(user.id, user.status === "active" ? "inactive" : "active"));
                  }}
                >
                  {user.status === "active" ? t("deactivate") : t("activate")}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        title={t("addUser")}
        onClose={() => setOpen(false)}
        footer={<Button disabled={pending} onClick={() => void submit()}>{t("addUser")}</Button>}
      >
        <div className="grid gap-3">
          <Input placeholder="الاسم" value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <Input placeholder="البريد" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Select value={role} onChange={(event) => setRole(event.target.value as "admin" | "sales")}>
            <option value="sales">{roles("sales")}</option>
            {isSuperAdmin ? <option value="admin">{roles("admin")}</option> : null}
          </Select>
          <Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
            <option value="invitation">{t("sendInvite")}</option>
            <option value="random_password">{t("randomPassword")}</option>
            <option value="custom_password">{t("customPassword")}</option>
          </Select>
          {method === "custom_password" ? (
            <Input type="password" placeholder={auth("password")} value={password} onChange={(event) => setPassword(event.target.value)} />
          ) : null}
        </div>
      </Dialog>
      <Dialog open={Boolean(temporary)} title={t("tempPassword")} onClose={() => setTemporary(null)}>
        <p className="mb-3 text-sm text-danger">{t("showOnceWarning")}</p>
        <p className="rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm">{temporary}</p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={async () => {
            if (temporary) await navigator.clipboard.writeText(temporary);
            toast.push({ title: auth("copied"), tone: "success" });
          }}
        >
          {auth("copy")}
        </Button>
      </Dialog>
      <Dialog open={Boolean(revealed)} title="الرقم القومي" onClose={() => setRevealed(null)}>
        <p className="font-mono text-lg">{revealed}</p>
      </Dialog>
      <Dialog open={Boolean(editing)} title="تعديل المستخدم" onClose={() => setEditing(null)}>
        {editing ? (
          <EditUser
            user={editing}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setEditing(null)}
            onDone={done}
          />
        ) : null}
      </Dialog>
    </div>
  );

  async function submit() {
    setPending(true);
    const result = await provisionUserAction({ fullName, email, role, method, password });
    if (done(result)) {
      setOpen(false);
      setFullName("");
      setEmail("");
      setPassword("");
    }
  }
}

function EditUser({
  user,
  isSuperAdmin,
  onClose,
  onDone,
}: {
  user: DirectoryUser;
  isSuperAdmin: boolean;
  onClose: () => void;
  onDone: (result: { ok: boolean; error?: string; temporaryPassword?: string }) => boolean;
}) {
  const t = useTranslations("users");
  const roles = useTranslations("roles");
  const [name, setName] = useState(user.full_name ?? "");
  const [custom, setCustom] = useState("");

  return (
    <div className="grid gap-3">
      <Input value={name} onChange={(event) => setName(event.target.value)} />
      <Button
        variant="secondary"
        onClick={async () => {
          if (onDone(await renameUserAction(user.id, name))) onClose();
        }}
      >
        حفظ الاسم
      </Button>
      {isSuperAdmin && !user.is_super_admin ? (
        <Select
          value={user.role}
          onChange={async (event) => {
            onDone(await changeRoleAction(user.id, event.target.value as "admin" | "sales"));
          }}
        >
          <option value="sales">{roles("sales")}</option>
          <option value="admin">{roles("admin")}</option>
        </Select>
      ) : null}
      <Button variant="secondary" onClick={async () => onDone(await resetPasswordAction(user.id, "reset_link", user.email))}>
        {t("sendResetLink")}
      </Button>
      <Button variant="secondary" onClick={async () => onDone(await resetPasswordAction(user.id, "random_temporary", user.email))}>
        {t("randomPassword")}
      </Button>
      <Input type="password" placeholder="كلمة مرور مؤقتة" value={custom} onChange={(event) => setCustom(event.target.value)} />
      <Button variant="secondary" onClick={async () => onDone(await resetPasswordAction(user.id, "custom_temporary", user.email, custom))}>
        {t("customPassword")}
      </Button>
    </div>
  );
}
