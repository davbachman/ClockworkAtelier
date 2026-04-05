export interface Point {
  x: number
  y: number
}

export interface Layer {
  id: string
  name: string
  order: number
}

export interface Gear {
  id: string
  teeth: number
  layerId: string
  center: Point
}

export type AnchorKind = 'motor' | 'secondArbor' | 'minuteArbor' | 'hourArbor'
export type HandAnchor = Exclude<AnchorKind, 'motor'>
export type HandAngles = Record<HandAnchor, number>

export type ConstraintState =
  | 'free'
  | 'meshSnap'
  | 'coaxialSnap'
  | 'invalidLoop'
  | 'invalidOverlap'

export interface ComputedGearState {
  rpm: number | null
  drivenByMotor: boolean
  conflicts: boolean
}

export interface DraftGear {
  mode: 'placing' | 'moving'
  gearId: string | null
  layerId: string
  teeth: number
  center: Point
  offset: Point
  originalCenter: Point | null
}

export interface PlacementResult {
  center: Point
  state: ConstraintState
  highlightedGearIds: string[]
  highlightedAnchors: AnchorKind[]
}

export interface HandState {
  anchor: HandAnchor
  rpm: number | null
  driven: boolean
  conflicts: boolean
  correct: boolean
}

export interface ClockAnalysis {
  computedByGearId: Record<string, ComputedGearState>
  handStates: Record<HandAnchor, HandState>
  status:
    | { kind: 'working'; label: string }
    | { kind: 'wrong'; label: string }
    | null
}

export interface NoticeState {
  message: string
  variant: 'neutral' | 'success' | 'error'
}

export interface ClockworkProjectV1 {
  version: 1
  layers: Array<{
    id: string
    name: string
    order: number
  }>
  gears: Array<{
    id: string
    teeth: number
    layerId: string
    center: Point
  }>
  camera: {
    panX: number
    panY: number
  }
}
