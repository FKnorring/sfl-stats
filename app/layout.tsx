import { Geist_Mono, Space_Grotesk, JetBrains_Mono } from "next/font/google"

import "./globals.css"
import { SideNav } from "@/components/side-nav"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
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
            <div className="flex min-h-svh">
              <SideNav />
              <div className="min-w-0 flex-1">{children}</div>
            </div>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
