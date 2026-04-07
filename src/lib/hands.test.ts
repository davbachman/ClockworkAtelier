import {
  createRandomHandAngles,
  getAnimatedHandAngle,
  getCurrentTimeHandAngles,
  normalizeAngle,
} from './hands'

describe('hands', () => {
  it('normalizes angles into a 0-360 range', () => {
    expect(normalizeAngle(450)).toBe(90)
    expect(normalizeAngle(-90)).toBe(270)
  })

  it('creates deterministic random hand angles when given a custom source', () => {
    const values = [0.1, 0.5, 0.9, 0.25, 0.75]
    let index = 0
    const angles = createRandomHandAngles(() => values[index++] ?? 0)

    expect(angles).toEqual({
      secondArbor: 36,
      minuteArbor: 180,
      hourArbor: 324,
      amPmArbor: 90,
      dayArbor: 270,
    })
  })

  it('computes current-time hand angles from a date', () => {
    const angles = getCurrentTimeHandAngles(new Date(2026, 3, 5, 3, 15, 30, 0))

    expect(angles.secondArbor).toBeCloseTo(180, 6)
    expect(angles.minuteArbor).toBeCloseTo(93, 6)
    expect(angles.hourArbor).toBeCloseTo(97.75, 6)
    expect(angles.amPmArbor).toBeCloseTo(97.75, 6)
    expect(angles.dayArbor).toBeCloseTo(6.9821, 4)
  })

  it('adds simulated rotation on top of the base hand angle while playing', () => {
    expect(getAnimatedHandAngle(90, 1, 15_000, true)).toBeCloseTo(180, 6)
    expect(getAnimatedHandAngle(90, null, 15_000, true)).toBe(90)
    expect(getAnimatedHandAngle(90, 1, 15_000, false)).toBe(90)
  })
})
