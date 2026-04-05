function greatestCommonDivisor(valueA: number, valueB: number): number {
  let currentA = Math.abs(valueA)
  let currentB = Math.abs(valueB)

  while (currentB !== 0) {
    const nextValue = currentA % currentB
    currentA = currentB
    currentB = nextValue
  }

  return currentA || 1
}

export function approximateFraction(value: number, maxDenominator = 1_000_000) {
  if (!Number.isFinite(value)) {
    return { numerator: 0, denominator: 1 }
  }

  if (Math.abs(value) <= Number.EPSILON) {
    return { numerator: 0, denominator: 1 }
  }

  const sign = value < 0 ? -1 : 1
  let currentValue = Math.abs(value)
  let previousNumerator = 0
  let numerator = 1
  let previousDenominator = 1
  let denominator = 0

  while (true) {
    const coefficient = Math.floor(currentValue)
    const nextNumerator = coefficient * numerator + previousNumerator
    const nextDenominator = coefficient * denominator + previousDenominator

    if (nextDenominator > maxDenominator) {
      break
    }

    previousNumerator = numerator
    numerator = nextNumerator
    previousDenominator = denominator
    denominator = nextDenominator

    const remainder = currentValue - coefficient
    if (remainder <= 1e-12) {
      break
    }

    currentValue = 1 / remainder
  }

  const divisor = greatestCommonDivisor(numerator, denominator)
  return {
    numerator: (sign * numerator) / divisor,
    denominator: denominator / divisor,
  }
}

export function formatRpmFraction(rpm: number) {
  const { numerator, denominator } = approximateFraction(rpm)
  return `${numerator}/${denominator} rpm`
}
