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

export type EditorMode = 'clock' | 'orrery'

export type AnchorId =
  | 'motor'
  | 'secondArbor'
  | 'minuteArbor'
  | 'hourArbor'
  | 'amPmArbor'
  | 'dayArbor'
  | 'mercuryArbor'
  | 'venusArbor'
  | 'earthArbor'
  | 'marsArbor'
  | 'jupiterArbor'
  | 'saturnArbor'

export type AnchorKind = AnchorId
export type ClockAnchor =
  | 'secondArbor'
  | 'minuteArbor'
  | 'hourArbor'
  | 'amPmArbor'
  | 'dayArbor'
export type OrreryAnchor =
  | 'mercuryArbor'
  | 'venusArbor'
  | 'earthArbor'
  | 'marsArbor'
  | 'jupiterArbor'
  | 'saturnArbor'

export type HandAnchor = ClockAnchor
export type HandAngles = Record<HandAnchor, number>
export type BaseAngleMap = Record<string, number>

export interface Fraction {
  numerator: number
  denominator: number
}

export interface OutputTarget {
  id: Exclude<AnchorId, 'motor'>
  label: string
  layerOrder: number
  targetRpm: number
  arborRadius: number
  center: Point
  orbitRadius?: number
  targetPeriodFraction?: Fraction
  assetId?: string
}

export interface ModeConfig {
  mode: EditorMode
  title: string
  theme: 'clock' | 'orrery'
  layerSectionTitle: string
  allowAddLayer: boolean
  motorLabel: string | null
  statusLabels: {
    working: string
    wrong: string
  }
  layers: Layer[]
  outputs: OutputTarget[]
}

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
  highlightedAnchors: AnchorId[]
}

export interface OutputState {
  id: Exclude<AnchorId, 'motor'>
  label: string
  rpm: number | null
  driven: boolean
  conflicts: boolean
  correct: boolean
  targetRpm: number
}

export interface TrainAnalysis {
  computedByGearId: Record<string, ComputedGearState>
  outputStates: Record<string, OutputState>
  status:
    | { kind: 'working'; label: string }
    | { kind: 'wrong'; label: string }
    | null
}

export interface NoticeState {
  message: string
  variant: 'neutral' | 'success' | 'error'
}

export interface WorkspaceProjectSlice {
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

export interface ClockworkProjectV1 extends WorkspaceProjectSlice {
  version: 1
}

export interface AtelierProjectV2 {
  version: 2
  activeMode: EditorMode
  clock: WorkspaceProjectSlice
  orrery: WorkspaceProjectSlice
}
