// AFTERLIGHT — look presets.
// Each look is a complete, materially different treatment (see DESIGN.md):
//   vesper  : emerald dusk, warm cream horizon, saturated cool shadows  (chosen direction)
//   ember   : hot terracotta/violet, blown-out travel direction
//   ink     : pale cel palette with contour outlines on hero architecture
// Values are authored as CSS hex strings and converted to working space by three.

export const LOOKS = {
  vesper: {
    id: 'vesper',
    label: 'Emerald Vesper',
    blurb: 'Deep emerald sea, cream horizon, cool violet shadows.',
    sky: {
      zenith: '#22375e',
      mid: '#5d6f96',
      horizon: '#ffc48c',
      low: '#1d5f5c',
      sunTint: '#ffe6bd',
      sunSize: 0.030,
      glow: 0.55,
      bandStrength: 0.55,
    },
    sun: { color: '#ffdcae', intensity: 3.0, elevDeg: 8.5, azimDeg: 138 },
    hemi: { sky: '#89a6c8', ground: '#20514c', intensity: 0.86 },
    fog: { color: '#c9a189', density: 0.00072 },
    sea: {
      shallow: '#2ab08f',
      mid: '#126d70',
      deep: '#0d2f4a',
      glitter: '#ffd79c',
      foam: '#f2eee0',
      waveHeight: 1.15,
      choppy: 1.0,
    },
    rock: {
      top: '#8d7359',
      side: '#7b5a45',
      strata: '#5c3f34',
      shadow: '#463a5c',
      crown: '#4f7a52',
      crownAlt: '#6f9d63',
      sand: '#e6d6b4',
    },
    craft: { sail: '#f2e3c8', accent: '#e2704a', keel: '#33303c', boom: '#8a6a49' },
    clouds: '#ffd9b3',
    mote: '#ffe6c0',
    exposure: 0.92,
    bloom: { strength: 0.32, radius: 0.30, threshold: 0.92 },
    outline: false,
  },

  ember: {
    id: 'ember',
    label: 'Ember Tide',
    blurb: 'Terracotta tops, violet flanks, the horizon blown out ahead.',
    sky: {
      zenith: '#4a3a63',
      mid: '#a4787e',
      horizon: '#ffe6b4',
      low: '#7c4a49',
      sunTint: '#fff3d0',
      sunSize: 0.034,
      glow: 0.7,
      bandStrength: 0.75,
    },
    sun: { color: '#ffcf8f', intensity: 3.4, elevDeg: 12, azimDeg: 150 },
    hemi: { sky: '#c69a86', ground: '#6a3f52', intensity: 0.62 },
    fog: { color: '#e0b394', density: 0.00072 },
    sea: {
      shallow: '#3aa79b',
      mid: '#25607f',
      deep: '#1b3450',
      glitter: '#ffe2ac',
      foam: '#fdf3e0',
      waveHeight: 0.95,
      choppy: 0.9,
    },
    rock: {
      top: '#e08a4c',
      side: '#b8643c',
      strata: '#8a4433',
      shadow: '#6b3f78',
      crown: '#7d6f45',
      crownAlt: '#9b8449',
      sand: '#f0dcb2',
    },
    craft: { sail: '#fff0d6', accent: '#ff8a4c', keel: '#3a2b2b', boom: '#a3703f' },
    clouds: '#ffcfa0',
    mote: '#ffdca6',
    exposure: 1.02,
    bloom: { strength: 0.78, radius: 0.8, threshold: 0.6 },
    outline: false,
  },

  ink: {
    id: 'ink',
    label: 'Ink Meridian',
    blurb: 'Pale sage cel palette with drawn contours on the landmarks.',
    sky: {
      zenith: '#7fb0b6',
      mid: '#bfd6d0',
      horizon: '#f6e9cf',
      low: '#5f8f8b',
      sunTint: '#fff6e0',
      sunSize: 0.026,
      glow: 0.35,
      bandStrength: 0.3,
    },
    sun: { color: '#fff4dd', intensity: 2.35, elevDeg: 26, azimDeg: 120 },
    hemi: { sky: '#d9e8e2', ground: '#7e9c8f', intensity: 0.85 },
    fog: { color: '#cfe0d8', density: 0.00052 },
    sea: {
      shallow: '#8fd7c6',
      mid: '#4fa8a4',
      deep: '#3d7f8c',
      glitter: '#fff6e0',
      foam: '#ffffff',
      waveHeight: 0.7,
      choppy: 0.75,
    },
    rock: {
      top: '#e7dcc2',
      side: '#cbb997',
      strata: '#a9906c',
      shadow: '#6e8f86',
      crown: '#7fa477',
      crownAlt: '#9dbb87',
      sand: '#f2e7cb',
    },
    craft: { sail: '#fffaf0', accent: '#d9743f', keel: '#3b3a38', boom: '#8d7a5c' },
    clouds: '#ffffff',
    mote: '#ffffff',
    exposure: 1.1,
    bloom: { strength: 0.35, radius: 0.6, threshold: 0.9 },
    outline: true,
  },
};

export const LOOK_ORDER = ['vesper', 'ember', 'ink'];

export function getLook(id) {
  return LOOKS[id] || LOOKS.vesper;
}
