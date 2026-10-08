"use client"

import Link from "next/link"
import { Suspense } from "react"
import { usePathname } from "next/navigation"
import {
  CalendarDaysIcon,
  CircleHelpIcon,
  GitCompareIcon,
  HomeIcon,
  WrenchIcon,
  StarIcon,
  TrophyIcon,
  TvIcon,
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
  useSidebar,
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
  return (
    <Suspense fallback={<Navigation showAdmin={showAdmin} />}>
      <ActiveNavigation showAdmin={showAdmin} />
    </Suspense>
  )
}

function ActiveNavigation({ showAdmin }: { showAdmin: boolean }) {
  const pathname = usePathname()
  return <Navigation showAdmin={showAdmin} pathname={pathname} />
}

function Navigation({
  showAdmin,
  pathname,
}: {
  showAdmin: boolean
  pathname?: string
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const items = showAdmin
    ? [
        ...ITEMS,
        { href: "/admin", label: "Admin", icon: WrenchIcon },
        { href: "/admin/streams", label: "Streams", icon: TvIcon },
      ]
    : ITEMS
  // Longest matching href wins so /teams/compare doesn't also light up /teams.
  const active = items
    .filter(({ href }) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname?.startsWith(`${href}/`)
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
            <SidebarMenu className="gap-1">
              {items.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    isActive={href === active}
                    aria-current={href === active ? "page" : undefined}
                    tooltip={label}
                    className="h-10 px-3 data-active:bg-sidebar-primary/10 data-active:text-sidebar-primary"
                    render={
                      <Link
                        href={href}
                        onNavigate={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                      />
                    }
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
