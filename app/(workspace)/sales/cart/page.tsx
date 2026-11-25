import { CartDesk } from "@/components/sales/cart-desk";
import { EmptyState } from "@/components/ui/empty-state";
import { hasPublicEnv } from "@/lib/env";

export default function CartPage() {
  if (!hasPublicEnv()) {
    return <EmptyState title="سلة البيع" body="اربط مشروع سوبربيز للتطوير لتسجيل البيع." />;
  }
  return <CartDesk />;
}
