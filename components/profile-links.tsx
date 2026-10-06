import type { SVGProps } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// Inline Simple Icons marks (steam/faceit) — lucide-react has neither, and
// pulling in a whole icon-set package for two glyphs isn't worth it.
function SteamIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" />
    </svg>
  )
}

function FaceitIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M23.999 2.705a.167.167 0 00-.312-.1 1141.27 1141.27 0 00-6.053 9.375H.218c-.221 0-.301.282-.11.352 7.227 2.73 17.667 6.836 23.5 9.134.15.06.39-.08.39-.18z" />
    </svg>
  )
}

const iconLinkClassName =
  "text-muted-foreground transition-colors hover:text-foreground"

/**
 * Steam Community / Faceit profile links, rendered as icons with a tooltip
 * naming the destination rather than the raw steamID/nickname as link text.
 * Faceit is omitted when there's no matched profile. Relies on the
 * `TooltipProvider` mounted once in app/layout.tsx rather than wrapping its
 * own, since this renders per-row in tables.
 */
export function ProfileLinks({
  steamid64,
  faceitNickname,
  className,
}: {
  steamid64: string | null
  faceitNickname?: string | null
  className?: string
}) {
  if (!steamid64 && !faceitNickname) return null

  return (
    <div className={className ?? "flex items-center gap-1.5"}>
      {steamid64 ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={`https://steamcommunity.com/profiles/${steamid64}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Steam Community profile"
                className={iconLinkClassName}
              >
                <SteamIcon className="size-4" />
              </a>
            }
          />
          <TooltipContent>Steam Community profile</TooltipContent>
        </Tooltip>
      ) : null}
      {faceitNickname ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <a
                href={`https://www.faceit.com/en/players/${faceitNickname}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Faceit profile"
                className={iconLinkClassName}
              >
                <FaceitIcon className="size-4" />
              </a>
            }
          />
          <TooltipContent>Faceit profile</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
