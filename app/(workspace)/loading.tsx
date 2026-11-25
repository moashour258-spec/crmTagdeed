import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-24" />
      ))}
    </div>
  );
}
