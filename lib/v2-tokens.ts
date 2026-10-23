/**
 * v2 design tokens. Light and dark values stay AA for text and controls.
 * accent is decorative only. primary is the button fill in both themes.
 */

export const V2_TOKENS = {
  light: {
    bg: "#f5f8f6",
    surface: "#ffffff",
    surface2: "#eef4f0",
    border: "#dce6df",
    field: "#7b8b7f",
    text: "#0f1a13",
    muted: "#55625a",
    primary: "#00854c",
    primaryHover: "#00703f",
    onPrimary: "#ffffff",
    primaryText: "#00703f",
    accent: "#00b162",
    accentSoft: "#e2f4e9",
    success: "#00703f",
    successSoft: "#e2f4e9",
    warning: "#8a4500",
    warningSoft: "#fff3df",
    danger: "#b3000a",
    dangerSoft: "#fdecec",
    focus: "#0a5c36",
  },
  dark: {
    bg: "#0a110d",
    surface: "#111a15",
    surface2: "#17231c",
    border: "#263429",
    field: "#6f8275",
    text: "#e8efea",
    muted: "#a0afa5",
    primary: "#00854c",
    primaryHover: "#009656",
    onPrimary: "#ffffff",
    primaryText: "#4fd68f",
    accent: "#00b162",
    accentSoft: "#123a26",
    success: "#4fd68f",
    successSoft: "#123a26",
    warning: "#f6b44c",
    warningSoft: "#3a2a0e",
    danger: "#ff8a8a",
    dangerSoft: "#3d1416",
    focus: "#7fe3ad",
  },
} as const

export const V2_TYPE = [13, 15, 17, 20, 24, 32, 40] as const
export const V2_RADIUS = {
  control: 12,
  card: 16,
  hero: 24,
} as const
