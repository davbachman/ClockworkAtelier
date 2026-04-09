import type { BaseAngleMap, HandAngles } from './types'

export function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

export function createRandomAngles(anchorIds: string[], randomValue = Math.random): BaseAngleMap {
  return Object.fromEntries(
    anchorIds.map((anchorId) => [anchorId, normalizeAngle(randomValue() * 360)]),
  )
}

export function createRandomHandAngles(randomValue = Math.random): HandAngles {
  return createRandomAngles(
    ['secondArbor', 'minuteArbor', 'hourArbor', 'amPmArbor', 'dayArbor'],
    randomValue,
  ) as HandAngles
}

export function getCurrentTimeHandAngles(now = new Date()): HandAngles {
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000
  const minutes = now.getMinutes() + seconds / 60
  const hours = (now.getHours() % 12) + minutes / 60
  const amPmHours = (now.getHours() + 12) % 24 + minutes / 60
  const dayFraction =
    now.getDay() +
    (now.getHours() + now.getMinutes() / 60 + seconds / 3600) / 24

  return {
    secondArbor: normalizeAngle((seconds / 60) * 360),
    minuteArbor: normalizeAngle((minutes / 60) * 360),
    hourArbor: normalizeAngle((hours / 12) * 360),
    amPmArbor: normalizeAngle((amPmHours / 24) * 360),
    dayArbor: normalizeAngle(((dayFraction - 0.5) / 7) * 360),
  }
}

export function getAnimatedAngle(
  baseAngle: number,
  rpm: number | null,
  playbackMs: number,
  isPlaying: boolean,
) {
  if (!isPlaying || rpm === null) {
    return normalizeAngle(baseAngle)
  }

  return normalizeAngle(baseAngle + (rpm * 360 * playbackMs) / 60000)
}

export function getAnimatedHandAngle(
  baseAngle: number,
  rpm: number | null,
  playbackMs: number,
  isPlaying: boolean,
) {
  return getAnimatedAngle(baseAngle, rpm, playbackMs, isPlaying)
}
