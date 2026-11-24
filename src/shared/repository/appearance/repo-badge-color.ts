export const REPO_COLORS = [
  '#737373', // neutral
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#8b5cf6', // purple
  '#ec4899' // pink
] as const

export const DEFAULT_REPO_BADGE_COLOR = REPO_COLORS[0]

const HEX_COLOR_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function normalizeRepoBadgeColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const match = value.trim().match(HEX_COLOR_PATTERN)
  if (!match) {
    return null
  }

  const rawHex = match[1].toLowerCase()
  const hex =
    rawHex.length === 3
      ? rawHex
          .split('')
          .map((part) => part + part)
          .join('')
      : rawHex
  const normalized = `#${hex}`
  return REPO_COLORS.find((repoColor) => repoColor === normalized) ?? normalized
}

export function resolveRepoBadgeColor(value: unknown): string {
  return normalizeRepoBadgeColor(value) ?? DEFAULT_REPO_BADGE_COLOR
}

const LIGHT_TEXT = '#ffffff'
const DARK_TEXT = '#0a0a0a'

function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

// Why: monograms are bold glyphs, so 3:1 (WCAG large text / graphics) is the bar; white is
// preferred while it clears it because dark letters on saturated fills read as a warning.
const MIN_LETTER_CONTRAST = 3

/** White unless it fails contrast on the fill, then near-black. */
export function readableTextColorOn(background: unknown): string {
  const luminance = relativeLuminance(resolveRepoBadgeColor(background))
  return 1.05 / (luminance + 0.05) >= MIN_LETTER_CONTRAST ? LIGHT_TEXT : DARK_TEXT
}
