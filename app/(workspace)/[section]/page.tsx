import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sectionKeys } from "@/components/shell/nav";
import { EmptyState } from "@/components/ui/empty-state";

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sectionKeys.has(section) || section === "account") notFound();
  const common = await getTranslations("common");
  return <EmptyState title={common("empty")} body="هذه الشاشة تُبنى في المرحلة التالية. لا توجد بيانات للعرض." />;
}
