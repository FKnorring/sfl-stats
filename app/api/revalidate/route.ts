import { revalidateTag } from "next/cache"
import { handleCacheRevalidation } from "@/lib/cache-revalidation"

export async function POST(request: Request) {
  return handleCacheRevalidation(request, (tags) => {
    for (const tag of tags) revalidateTag(tag, "max")
  })
}
