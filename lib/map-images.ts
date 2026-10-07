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
  de_ancient: {
    url: "/maps/de_ancient_radar.webp",
    originX: -2953,
    originY: 2164,
    scale: 5,
  },
  de_anubis: {
    url: "/maps/de_anubis_radar.webp",
    originX: -2796,
    originY: 3328,
    scale: 5.22,
  },
  de_cache: {
    url: "/maps/de_cache_radar.webp",
    originX: -2000,
    originY: 3250,
    scale: 5.5,
  },
  de_dust2: {
    url: "/maps/de_dust2_radar.png",
    originX: -2476,
    originY: 3239,
    scale: 4.4,
  },
  de_inferno: {
    url: "/maps/de_inferno_radar.png",
    originX: -2087,
    originY: 3870,
    scale: 4.9,
  },
  de_mirage: {
    url: "/maps/de_mirage_radar.png",
    originX: -3230,
    originY: 1713,
    scale: 5.0,
  },
  de_nuke: {
    url: "/maps/de_nuke_radar.webp",
    originX: -3453,
    originY: 2887,
    scale: 7.0,
  },
}

export function getMapRadar(mapName: string | null): MapRadar | null {
  if (!mapName) return null
  return MAP_RADARS[mapName] ?? null
}
