import type { HandAngles } from './types'

export function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

export function createRandomHandAngles(randomValue = Math.random): HandAngles {
  return {
    secondArbor: normalizeAngle(randomValue() * 360),
    minuteArbor: normalizeAngle(randomValue() * 360),
    hourArbor: normalizeAngle(randomValue() * 360),
  }
}

export function getCurrentTimeHandAngles(now = new Date()): HandAngles {
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000
  const minutes = now.getMinutes() + seconds / 60
  const hours = (now.getHours() % 12) + minutes / 60

  return {
    secondArbor: normalizeAngle((seconds / 60) * 360),
    minuteArbor: normalizeAngle((minutes / 60) * 360),
    hourArbor: normalizeAngle((hours / 12) * 360),
  }
}

export function getAnimatedHandAngle(
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
