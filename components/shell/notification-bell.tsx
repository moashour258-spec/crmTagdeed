"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { markNoticeAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import type { Notice } from "@/lib/auth/session";

export function NotificationBell({ notices }: { notices: Notice[] }) {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const unread = notices.filter((notice) => !notice.readAt).length;

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" aria-label={t("title")} onClick={() => setOpen((value) => !value)}>
        <Bell className="size-5" />
        {unread > 0 ? <span className="tabular-nums text-xs">{unread}</span> : null}
      </Button>
      {open ? (
        <div className="absolute start-0 z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-2 text-foreground shadow-card">
          <p className="px-2 py-1 text-sm font-semibold">{t("title")}</p>
          {notices.length === 0 ? <p className="px-2 py-3 text-sm text-muted">{t("empty")}</p> : null}
          {notices.map((notice) => (
            <button
              key={notice.id}
              type="button"
              className="block w-full rounded-[10px] px-2 py-2 text-start text-sm hover:bg-surface-2"
              onClick={() => void markNoticeAction(notice.id)}
            >
              <span className="font-medium">{notice.title}</span>
              {notice.body ? <span className="mt-1 block text-muted">{notice.body}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
