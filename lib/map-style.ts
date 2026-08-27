import type { StyleSpecification } from "maplibre-gl";

/**
 * Saint-Barth basemap: aquamarine shallows, sun-bleached sand, volcanic scrub.
 * Vector tiles come from OpenFreeMap (OpenMapTiles schema, no API key).
 *
 * The vector style below is authored against the live OpenFreeMap schema, but
 * MapLibre's worker never completes its handshake in the Electron review
 * browser: the style never finishes loading, no tiles are ever requested, and
 * no error is raised. Raster is unaffected because raster tiles load on the
 * main thread, so it ships as the default and is tinted on the GPU instead.
 * Flip this to true to re-test vector rendering on a real device.
 */
export const USE_VECTOR_BASEMAP = false;

const SAND = "#f2ead9";
const SAND_DEEP = "#e9dfc9";
const BEACH = "#faf3e2";
const SCRUB = "#d5ddbc";
const SCRUB_DEEP = "#c7d1aa";
const OCEAN = "#8ed2d8";
const SHALLOW = "#a9e0e3";
const BUILDING = "#e5dac4";
const ROAD = "#fffdf7";
const ROAD_CASING = "#e0d5bd";
const INK = "#0f313c";
const INK_SOFT = "#3b5c66";
const HALO = "#fbf7f0";

const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>';

export const ISLAND_MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: {
    ofm: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: ATTRIBUTION,
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": SAND } },
    {
      id: "landcover-scrub",
      type: "fill",
      source: "ofm",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland"]]],
      paint: { "fill-color": SCRUB, "fill-opacity": 0.85 },
    },
    {
      id: "landcover-beach",
      type: "fill",
      source: "ofm",
      "source-layer": "landcover",
      filter: ["==", ["get", "class"], "sand"],
      paint: { "fill-color": BEACH },
    },
    {
      id: "park",
      type: "fill",
      source: "ofm",
      "source-layer": "park",
      paint: { "fill-color": SCRUB_DEEP, "fill-opacity": 0.5 },
    },
    {
      id: "landuse-built",
      type: "fill",
      source: "ofm",
      "source-layer": "landuse",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["residential", "commercial", "industrial", "retail"]],
      ],
      paint: { "fill-color": SAND_DEEP, "fill-opacity": 0.55 },
    },
    {
      id: "water",
      type: "fill",
      source: "ofm",
      "source-layer": "water",
      filter: ["!=", ["get", "intermittent"], 1],
      paint: {
        "fill-color": [
          "match",
          ["get", "class"],
          "ocean",
          OCEAN,
          SHALLOW,
        ],
      },
    },
    {
      id: "waterway",
      type: "line",
      source: "ofm",
      "source-layer": "waterway",
      paint: {
        "line-color": SHALLOW,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 2.4],
      },
    },
    {
      id: "building",
      type: "fill",
      source: "ofm",
      "source-layer": "building",
      minzoom: 13,
      paint: {
        "fill-color": BUILDING,
        "fill-outline-color": SAND_DEEP,
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, 0.9],
      },
    },
    {
      id: "road-casing",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD_CASING,
        "line-width": [
          "interpolate",
          ["exponential", 1.4],
          ["zoom"],
          10,
          1.4,
          14,
          6,
          18,
          20,
        ],
      },
    },
    {
      id: "road",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service"]],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ROAD,
        "line-width": [
          "interpolate",
          ["exponential", 1.4],
          ["zoom"],
          10,
          0.6,
          14,
          3.6,
          18,
          14,
        ],
      },
    },
    {
      id: "path",
      type: "line",
      source: "ofm",
      "source-layer": "transportation",
      minzoom: 14,
      filter: ["in", ["get", "class"], ["literal", ["path", "track"]]],
      paint: {
        "line-color": SAND_DEEP,
        "line-width": 1.2,
        "line-dasharray": [2, 2],
      },
    },
    {
      id: "road-label",
      type: "symbol",
      source: "ofm",
      "source-layer": "transportation_name",
      minzoom: 14,
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": 11,
        "symbol-placement": "line",
      },
      paint: {
        "text-color": INK_SOFT,
        "text-halo-color": HALO,
        "text-halo-width": 1.2,
      },
    },
    {
      id: "water-label",
      type: "symbol",
      source: "ofm",
      "source-layer": "water_name",
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": 11,
        "text-letter-spacing": 0.12,
      },
      paint: {
        "text-color": "#2b7f88",
        "text-halo-color": "rgba(251, 247, 240, 0.7)",
        "text-halo-width": 1,
      },
    },
    {
      id: "place-label",
      type: "symbol",
      source: "ofm",
      "source-layer": "place",
      filter: [
        "in",
        ["get", "class"],
        ["literal", ["city", "town", "village", "hamlet", "suburb", "neighbourhood", "island"]],
      ],
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT_BOLD,
        "text-size": [
          "match",
          ["get", "class"],
          "city",
          15,
          "town",
          13,
          "island",
          13,
          11,
        ],
        "text-letter-spacing": 0.06,
        "text-max-width": 8,
      },
      paint: {
        "text-color": INK,
        "text-halo-color": HALO,
        "text-halo-width": 1.6,
      },
    },
  ],
};

/**
 * Default basemap while the vector worker is unusable. Paint properties tint
 * CARTO Voyager toward sand and aquamarine on the GPU — CSS filters on the
 * WebGL canvas blank the map in Chromium/Electron.
 */
export const FALLBACK_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    tiles: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
    },
  },
  layers: [
    {
      id: "tiles",
      type: "raster",
      source: "tiles",
      paint: {
        "raster-hue-rotate": -8,
        "raster-saturation": 0.22,
        "raster-contrast": -0.06,
        "raster-brightness-min": 0.04,
        "raster-brightness-max": 0.97,
      },
    },
  ],
};
