import { approximateFraction, formatRpmFraction } from './fractions'

describe('fractions', () => {
  it('formats integer rev/year values as fractions', () => {
    expect(formatRpmFraction(2)).toBe('2/1 rev/year')
  })

  it('reduces simple fractional rev/year values', () => {
    expect(formatRpmFraction(1 / 60)).toBe('1/60 rev/year')
    expect(formatRpmFraction(1 / 720)).toBe('1/720 rev/year')
  })

  it('formats negative rev/year values as signed fractions', () => {
    expect(formatRpmFraction(-3 / 2)).toBe('-3/2 rev/year')
  })

  it('approximates decimal values with a bounded denominator', () => {
    expect(approximateFraction(0.3333333333333333)).toEqual({
      numerator: 1,
      denominator: 3,
    })
  })
})
