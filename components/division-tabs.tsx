"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

/**
 * Division switcher backed by the `?division=` URL param, same convention
 * as FilterSelect in components/leaderboard-filters.tsx — pushing a new URL
 * re-triggers the Server Component page rather than fetching client-side.
 *
 * `children` must be actual TabsContent elements (built by the server page),
 * not a render-prop function — functions can't cross the server/client
 * component boundary.
 */
export function DivisionTabs({
  divisions,
  value,
  children,
}: {
  divisions: string[]
  value: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleChange(next: unknown) {
    if (typeof next !== "string") return
    const params = new URLSearchParams(searchParams.toString())
    params.set("division", next)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Tabs value={value} onValueChange={handleChange}>
      <TabsList>
        {divisions.map((d) => (
          <TabsTrigger key={d} value={d}>
            {d}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}

export { TabsContent }
