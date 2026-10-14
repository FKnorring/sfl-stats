"use client"

import Link from "next/link"
import { Suspense, useState } from "react"
import { usePathname } from "next/navigation"
import { Popover } from "@base-ui/react/popover"
import { Switch } from "@base-ui/react/switch"
import {
  CalendarDaysIcon,
  CircleHelpIcon,
  GitCompareIcon,
  HomeIcon,
  Settings2Icon,
  SparklesIcon,
  WrenchIcon,
  StarIcon,
  TrophyIcon,
  TvIcon,
  UsersIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { getFunMode, setFunMode as saveFunMode } from "@/lib/fun-mode"

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
      <SidebarFooter>
        <SettingsPopover />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function SettingsPopover() {
  const [funMode, setFunMode] = useState(false)

  function updateFunMode(checked: boolean) {
    setFunMode(checked)
    saveFunMode(checked)
  }

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) return
        setFunMode(getFunMode())
      }}
    >
      <Popover.Trigger
        aria-label="Settings"
        title="Settings"
        className="flex h-10 w-full items-center gap-2 overflow-hidden rounded-md px-3 text-left text-sm outline-hidden transition-colors group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <Settings2Icon className="size-4 shrink-0" />
        <span className="truncate group-data-[collapsible=icon]:hidden">
          Settings
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="top"
          align="start"
          sideOffset={8}
          className="z-50"
        >
          <Popover.Popup className="w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
            <Popover.Title className="mb-3 text-sm font-medium">
              Settings
            </Popover.Title>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="fun-mode"
                className="flex items-center gap-2 text-sm"
              >
                <SparklesIcon className="size-4" />
                Fun mode
              </label>
              <Switch.Root
                nativeButton
                id="fun-mode"
                checked={funMode}
                onCheckedChange={updateFunMode}
                className="flex h-5 w-9 shrink-0 items-center rounded-full bg-input p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-checked:bg-primary"
              >
                <Switch.Thumb className="size-4 rounded-full bg-background transition-transform data-checked:translate-x-4" />
              </Switch.Root>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
