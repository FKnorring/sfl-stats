"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

/**
 * Division switcher backed by `/teams/[division]`, preserving season filters.
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
  const searchParams = useSearchParams()

  function handleChange(next: unknown) {
    if (typeof next !== "string") return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("division")
    const suffix = params.size ? `?${params}` : ""
    router.push(`/teams/${encodeURIComponent(next)}${suffix}`)
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
