// Local backdrop images for each map in public/maps/, keyed by the exact
// map_name string stored on `matches` (the lowercase de_<name> console
// format demos are parsed with — see data/sfl.db).
const MAP_IMAGES: Record<string, string> = {
  de_ancient: "/maps/de_ancient.webp",
  de_anubis: "/maps/de_anubis.webp",
  de_cache: "/maps/de_cache.webp",
  de_dust2: "/maps/de_dust2.webp",
  de_inferno: "/maps/de_inferno.jpg",
  de_mirage: "/maps/de_mirage.webp",
  de_nuke: "/maps/de_nuke.webp",
}

export function getMapImageUrl(mapName: string | null): string | null {
  if (!mapName) return null
  return MAP_IMAGES[mapName] ?? null
}
