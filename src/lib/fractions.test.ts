import { approximateFraction, formatRpmFraction } from './fractions'

describe('fractions', () => {
  it('formats integer rpm values as fractions', () => {
    expect(formatRpmFraction(2)).toBe('2/1 rpm')
  })

  it('reduces simple fractional rpm values', () => {
    expect(formatRpmFraction(1 / 60)).toBe('1/60 rpm')
    expect(formatRpmFraction(1 / 720)).toBe('1/720 rpm')
  })

  it('formats negative rpm values as signed fractions', () => {
    expect(formatRpmFraction(-3 / 2)).toBe('-3/2 rpm')
  })

  it('approximates decimal values with a bounded denominator', () => {
    expect(approximateFraction(0.3333333333333333)).toEqual({
      numerator: 1,
      denominator: 3,
    })
  })
})
