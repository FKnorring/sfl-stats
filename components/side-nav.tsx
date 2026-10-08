"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  CalendarDaysIcon,
  CircleHelpIcon,
  GitCompareIcon,
  HomeIcon,
  WrenchIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/teams", label: "Teams", icon: UsersIcon },
  { href: "/matches", label: "Matches", icon: CalendarDaysIcon },
  { href: "/followed", label: "Followed", icon: StarIcon },
  { href: "/teams/compare", label: "Compare", icon: GitCompareIcon },
  { href: "/about", label: "About", icon: CircleHelpIcon },
]

export function SideNav({ showAdmin = false }: { showAdmin?: boolean }) {
  const pathname = usePathname()
  const items = showAdmin
    ? [...ITEMS, { href: "/admin", label: "Admin", icon: WrenchIcon }]
    : ITEMS
  // Longest matching href wins so /teams/compare doesn't also light up /teams.
  const active = items
    .filter(({ href }) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`)
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 py-2 font-heading text-sm font-medium group-data-[collapsible=icon]:hidden">
          SFL Stats
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={href === active}
                    tooltip={label}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
