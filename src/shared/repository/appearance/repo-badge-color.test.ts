import { describe, expect, it } from 'vitest'
import { readableTextColorOn } from './repo-badge-color'

describe('readableTextColorOn', () => {
  it('keeps white on dark and saturated fills', () => {
    for (const color of ['#737373', '#8b5cf6', '#ef4444', '#ec4899', '#000000']) {
      expect(readableTextColorOn(color)).toBe('#ffffff')
    }
  })

  it('switches to dark text on light fills', () => {
    for (const color of ['#eab308', '#f97316', '#22c55e', '#14b8a6', '#ffffff', '#fde68a']) {
      expect(readableTextColorOn(color)).toBe('#0a0a0a')
    }
  })

  it('treats invalid input as the neutral default', () => {
    expect(readableTextColorOn('nope')).toBe('#ffffff')
  })
})
