import { Skeleton } from "@/components/ui/skeleton"

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span className="sr-only">Carregando administração...</span>
      <Skeleton className="h-8 w-56 bg-zinc-900" />
      <Skeleton className="h-28 w-full bg-zinc-900" />
      <Skeleton className="h-64 w-full bg-zinc-900" />
    </div>
  )
}
