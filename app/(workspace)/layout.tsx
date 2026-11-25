import { WorkspaceFrame } from "@/components/shell/workspace-frame";
import { getGate, listNotices } from "@/lib/auth/session";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const gate = await getGate();
  const notices = gate ? await listNotices() : [];
  return (
    <WorkspaceFrame role={gate?.role ?? null} notices={notices}>
      {children}
    </WorkspaceFrame>
  );
}
