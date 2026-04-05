import type { AnchorKind, Layer, Point } from './types'

export const WORLD_WIDTH = 1200
export const WORLD_HEIGHT = 900
export const DIAL_OUTER_RADIUS = 340
export const DIAL_MIDDLE_RADIUS = 320
export const DIAL_INNER_RADIUS = 262
export const GEAR_BORE_RADIUS = 6
export const TOOTH_PITCH = 9
export const TOOTH_DEPTH = 10
export const MESH_SNAP_TOLERANCE = 15
export const COAXIAL_SNAP_TOLERANCE = 24
export const EXACT_POSITION_EPSILON = 0.75
export const CENTER_EXCLUSION_RADIUS = 26
export const MOTOR_AXLE_RADIUS = 12
export const MIN_TEETH = 6
export const MAX_TEETH = 240
export const CLOCK_CENTER: Point = { x: 0, y: 0 }
export const MOTOR_CENTER: Point = { x: -440, y: 280 }
export const SECOND_ARBOR_RADIUS = 9
export const MINUTE_ARBOR_RADIUS = 15
export const HOUR_ARBOR_RADIUS = 22
export const HAND_TARGET_RPM: Record<Exclude<AnchorKind, 'motor'>, number> = {
  secondArbor: 1,
  minuteArbor: 1 / 60,
  hourArbor: 1 / 720,
}

export const HAND_LAYER_NAMES: Record<number, string> = {
  1: 'Second Hand Layer',
  2: 'Minute Hand Layer',
  3: 'Hour Hand Layer',
}

export const BASE_LAYERS: Layer[] = [
  { id: 'layer-1', name: HAND_LAYER_NAMES[1], order: 1 },
  { id: 'layer-2', name: HAND_LAYER_NAMES[2], order: 2 },
  { id: 'layer-3', name: HAND_LAYER_NAMES[3], order: 3 },
]

export const ARBOR_BY_LAYER_ORDER: Record<number, Exclude<AnchorKind, 'motor'>> = {
  1: 'secondArbor',
  2: 'minuteArbor',
  3: 'hourArbor',
}

export const ARBOR_RADII: Record<Exclude<AnchorKind, 'motor'>, number> = {
  secondArbor: SECOND_ARBOR_RADIUS,
  minuteArbor: MINUTE_ARBOR_RADIUS,
  hourArbor: HOUR_ARBOR_RADIUS,
}

export const ANCHOR_POSITIONS: Record<AnchorKind, Point> = {
  motor: MOTOR_CENTER,
  secondArbor: CLOCK_CENTER,
  minuteArbor: CLOCK_CENTER,
  hourArbor: CLOCK_CENTER,
}
