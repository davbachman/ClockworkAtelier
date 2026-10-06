import { EXACT_POSITION_EPSILON } from './constants'
import { distanceBetween, GEAR_TOOTH_CENTER_FRACTION, getPitchRadius } from './geometry'
import type { Gear } from './types'

type GearPosition = Pick<Gear, 'center' | 'teeth' | 'layerId'>
const TAU = Math.PI * 2

export function gearsMesh(a: GearPosition, b: GearPosition) {
  return a.layerId === b.layerId && Math.abs(distanceBetween(a.center, b.center)
    - getPitchRadius(a.teeth) - getPitchRadius(b.teeth)) <= EXACT_POSITION_EPSILON
}

// Rotations are in the 3D scene's Y-up coordinates, not SVG's Y-down coordinates.
export function getMeshingRotation(driver: GearPosition, driverRotation: number, follower: GearPosition) {
  const direction = Math.atan2(driver.center.y - follower.center.y, follower.center.x - driver.center.x)
  const driverPitch = TAU / driver.teeth
  const followerPitch = TAU / follower.teeth
  const driverToothCenter = -Math.PI / 2 + GEAR_TOOTH_CENTER_FRACTION * driverPitch
  const followerToothCenter = -Math.PI / 2 + GEAR_TOOTH_CENTER_FRACTION * followerPitch
  const driverPhase = (direction - driverRotation - driverToothCenter) / driverPitch
  const rotation = direction + Math.PI - followerToothCenter - (0.5 - driverPhase) * followerPitch
  return ((rotation + followerPitch / 2) % followerPitch + followerPitch) % followerPitch - followerPitch / 2
}

export function getGearPhases(gears: Gear[]) {
  const phases = new Map<string, number>()
  for (const root of gears) {
    if (phases.has(root.id)) continue
    phases.set(root.id, 0)
    const queue = [root]
    for (let index = 0; index < queue.length; index++) {
      const driver = queue[index]
      for (const follower of gears) {
        if (phases.has(follower.id) || !gearsMesh(driver, follower)) continue
        phases.set(follower.id, getMeshingRotation(driver, phases.get(driver.id)!, follower))
        queue.push(follower)
      }
    }
  }
  return phases
}
