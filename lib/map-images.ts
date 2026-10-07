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

// Top-down radar overviews (1024x1024) plus the calibration from the game's
// resource/overviews/<map>.txt: world position of the image's top-left
// corner (pos_x, pos_y) and world units per pixel (scale). Pixel position of
// a world point is ((x - originX) / scale, (originY - y) / scale).
export type MapRadar = {
  url: string
  originX: number
  originY: number
  scale: number
}

const MAP_RADARS: Record<string, MapRadar> = {
  de_inferno: {
    url: "/maps/de_inferno_radar.png",
    originX: -2087,
    originY: 3870,
    scale: 4.9,
  },
}

export function getMapRadar(mapName: string | null): MapRadar | null {
  if (!mapName) return null
  return MAP_RADARS[mapName] ?? null
}
