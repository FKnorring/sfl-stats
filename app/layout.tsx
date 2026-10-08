import { Geist_Mono, Space_Grotesk, JetBrains_Mono } from "next/font/google"

import "./globals.css"
import { SideNav } from "@/components/side-nav"
import { ThemeProvider } from "@/components/theme-provider"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { FollowProvider } from "@/components/follow-provider"
import { getCurrentTeamCatalog } from "@/lib/cached-data"
import { isLocalEnv } from "@/lib/env"

const jetbrainsMonoHeading = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-heading",
})

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const teams = await getCurrentTeamCatalog()
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        spaceGrotesk.variable,
        jetbrainsMonoHeading.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <FollowProvider teams={teams}>
              <SidebarProvider>
                <SideNav showAdmin={isLocalEnv} />
                <SidebarInset className="min-w-0">{children}</SidebarInset>
              </SidebarProvider>
            </FollowProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
