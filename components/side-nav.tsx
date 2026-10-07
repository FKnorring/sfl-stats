"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { GitCompareIcon, HomeIcon, TrophyIcon, UsersIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/teams", label: "Teams", icon: UsersIcon },
  { href: "/teams/compare", label: "Compare", icon: GitCompareIcon },
]

export function SideNav() {
  const pathname = usePathname()

  // Longest matching href wins so /teams/compare doesn't also light up /teams.
  const active = ITEMS.filter(({ href }) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href)
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <nav
      aria-label="Main"
      className="sticky top-0 flex h-svh w-14 shrink-0 flex-col gap-1 border-r p-2 md:w-48"
    >
      <span className="hidden px-2 py-2 font-heading text-sm font-medium md:block">
        SFL Stats
      </span>
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          title={label}
          aria-current={href === active ? "page" : undefined}
          className={cn(
            "flex items-center justify-center gap-2 px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:justify-start",
            href === active && "bg-muted text-foreground"
          )}
        >
          <Icon className="size-4 shrink-0" />
          <span className="hidden md:inline">{label}</span>
        </Link>
      ))}
    </nav>
  )
}
