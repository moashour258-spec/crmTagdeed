import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <EmptyState
        title="غير موجود"
        body="الصفحة غير موجودة."
        action={
          <Button asChild>
            <Link href="/">العودة</Link>
          </Button>
        }
      />
    </main>
  );
}
