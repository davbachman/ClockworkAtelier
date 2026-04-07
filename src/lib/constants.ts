import type { AnchorId, EditorMode, Layer, ModeConfig, OutputTarget, Point } from './types'

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

export const WORKSPACE_CENTER: Point = { x: 0, y: 0 }
export const CLOCK_CENTER = WORKSPACE_CENTER
export const MOTOR_CENTER: Point = { x: -440, y: 280 }

export const SECOND_ARBOR_RADIUS = 9
export const MINUTE_ARBOR_RADIUS = 15
export const HOUR_ARBOR_RADIUS = 22
export const AM_PM_ARBOR_RADIUS = 11
export const DAY_ARBOR_RADIUS = 13

export const CLOCK_COMPLICATION_CENTER_OFFSET = DIAL_INNER_RADIUS / 2
export const AM_PM_DIAL_CENTER: Point = {
  x: WORKSPACE_CENTER.x + CLOCK_COMPLICATION_CENTER_OFFSET,
  y: WORKSPACE_CENTER.y,
}
export const DAY_DIAL_CENTER: Point = {
  x: WORKSPACE_CENTER.x - CLOCK_COMPLICATION_CENTER_OFFSET,
  y: WORKSPACE_CENTER.y,
}

export const ORRERY_ARBOR_RADII = {
  mercuryArbor: 8,
  venusArbor: 12,
  earthArbor: 16,
  marsArbor: 20,
  jupiterArbor: 24,
  saturnArbor: 28,
} as const

export const ORRERY_ORBIT_RADII = {
  mercuryArbor: 110,
  venusArbor: 169,
  earthArbor: 228,
  marsArbor: 287,
  jupiterArbor: 346,
  saturnArbor: 405,
} as const

export const HAND_TARGET_RPM = {
  secondArbor: 1,
  minuteArbor: 1 / 60,
  hourArbor: 1 / 720,
  amPmArbor: 1 / 720,
  dayArbor: 1 / (7 * 24 * 60),
} as const

export const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] as const
export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export const HAND_LAYER_NAMES: Record<number, string> = {
  1: 'Second Hand Layer',
  2: 'Minute Hand Layer',
  3: 'Hour Hand Layer',
  4: 'AM/PM',
  5: 'Day',
}

export const CLOCK_CORE_LAYERS: Layer[] = [
  { id: 'layer-1', name: HAND_LAYER_NAMES[1], order: 1 },
  { id: 'layer-2', name: HAND_LAYER_NAMES[2], order: 2 },
  { id: 'layer-3', name: HAND_LAYER_NAMES[3], order: 3 },
]

export const CLOCK_OPTIONAL_LAYERS: Layer[] = [
  { id: 'layer-4', name: HAND_LAYER_NAMES[4], order: 4 },
  { id: 'layer-5', name: HAND_LAYER_NAMES[5], order: 5 },
]

export const CLOCK_LAYERS: Layer[] = [...CLOCK_CORE_LAYERS, ...CLOCK_OPTIONAL_LAYERS]

export const BASE_LAYERS = CLOCK_CORE_LAYERS

export const ORRERY_LAYERS: Layer[] = [
  { id: 'layer-1', name: 'Mercury', order: 1 },
  { id: 'layer-2', name: 'Venus', order: 2 },
  { id: 'layer-3', name: 'Earth', order: 3 },
  { id: 'layer-4', name: 'Mars', order: 4 },
  { id: 'layer-5', name: 'Jupiter', order: 5 },
  { id: 'layer-6', name: 'Saturn', order: 6 },
]

export const CLOCK_OUTPUTS: OutputTarget[] = [
  {
    id: 'secondArbor',
    label: 'Second Hand',
    layerOrder: 1,
    targetRpm: HAND_TARGET_RPM.secondArbor,
    arborRadius: SECOND_ARBOR_RADIUS,
    center: WORKSPACE_CENTER,
  },
  {
    id: 'minuteArbor',
    label: 'Minute Hand',
    layerOrder: 2,
    targetRpm: HAND_TARGET_RPM.minuteArbor,
    arborRadius: MINUTE_ARBOR_RADIUS,
    center: WORKSPACE_CENTER,
  },
  {
    id: 'hourArbor',
    label: 'Hour Hand',
    layerOrder: 3,
    targetRpm: HAND_TARGET_RPM.hourArbor,
    arborRadius: HOUR_ARBOR_RADIUS,
    center: WORKSPACE_CENTER,
  },
  {
    id: 'amPmArbor',
    label: 'AM/PM',
    layerOrder: 4,
    targetRpm: HAND_TARGET_RPM.amPmArbor,
    arborRadius: AM_PM_ARBOR_RADIUS,
    center: AM_PM_DIAL_CENTER,
  },
  {
    id: 'dayArbor',
    label: 'Day',
    layerOrder: 5,
    targetRpm: HAND_TARGET_RPM.dayArbor,
    arborRadius: DAY_ARBOR_RADIUS,
    center: DAY_DIAL_CENTER,
  },
]

export const ORRERY_OUTPUTS: OutputTarget[] = [
  {
    id: 'mercuryArbor',
    label: 'Mercury',
    layerOrder: 1,
    targetRpm: 365 / 88,
    arborRadius: ORRERY_ARBOR_RADII.mercuryArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.mercuryArbor,
    targetPeriodFraction: { numerator: 88, denominator: 365 },
    assetId: 'mercury',
  },
  {
    id: 'venusArbor',
    label: 'Venus',
    layerOrder: 2,
    targetRpm: 365 / 225,
    arborRadius: ORRERY_ARBOR_RADII.venusArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.venusArbor,
    targetPeriodFraction: { numerator: 225, denominator: 365 },
    assetId: 'venus',
  },
  {
    id: 'earthArbor',
    label: 'Earth',
    layerOrder: 3,
    targetRpm: 1,
    arborRadius: ORRERY_ARBOR_RADII.earthArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.earthArbor,
    targetPeriodFraction: { numerator: 1, denominator: 1 },
    assetId: 'earth',
  },
  {
    id: 'marsArbor',
    label: 'Mars',
    layerOrder: 4,
    targetRpm: 365 / 687,
    arborRadius: ORRERY_ARBOR_RADII.marsArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.marsArbor,
    targetPeriodFraction: { numerator: 687, denominator: 365 },
    assetId: 'mars',
  },
  {
    id: 'jupiterArbor',
    label: 'Jupiter',
    layerOrder: 5,
    targetRpm: 365 / 4333,
    arborRadius: ORRERY_ARBOR_RADII.jupiterArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.jupiterArbor,
    targetPeriodFraction: { numerator: 4333, denominator: 365 },
    assetId: 'jupiter',
  },
  {
    id: 'saturnArbor',
    label: 'Saturn',
    layerOrder: 6,
    targetRpm: 365 / 10759,
    arborRadius: ORRERY_ARBOR_RADII.saturnArbor,
    center: WORKSPACE_CENTER,
    orbitRadius: ORRERY_ORBIT_RADII.saturnArbor,
    targetPeriodFraction: { numerator: 10759, denominator: 365 },
    assetId: 'saturn',
  },
]

export const ARBOR_BY_LAYER_ORDER: Record<number, Exclude<AnchorId, 'motor'>> = {
  1: 'secondArbor',
  2: 'minuteArbor',
  3: 'hourArbor',
  4: 'amPmArbor',
  5: 'dayArbor',
}

export const ARBOR_RADII: Record<Exclude<AnchorId, 'motor'>, number> = {
  secondArbor: SECOND_ARBOR_RADIUS,
  minuteArbor: MINUTE_ARBOR_RADIUS,
  hourArbor: HOUR_ARBOR_RADIUS,
  amPmArbor: AM_PM_ARBOR_RADIUS,
  dayArbor: DAY_ARBOR_RADIUS,
  mercuryArbor: ORRERY_ARBOR_RADII.mercuryArbor,
  venusArbor: ORRERY_ARBOR_RADII.venusArbor,
  earthArbor: ORRERY_ARBOR_RADII.earthArbor,
  marsArbor: ORRERY_ARBOR_RADII.marsArbor,
  jupiterArbor: ORRERY_ARBOR_RADII.jupiterArbor,
  saturnArbor: ORRERY_ARBOR_RADII.saturnArbor,
}

export const MODE_CONFIGS: Record<EditorMode, ModeConfig> = {
  clock: {
    mode: 'clock',
    title: 'Clockwork Atelier',
    theme: 'clock',
    layerSectionTitle: 'Layers',
    allowAddLayer: true,
    motorLabel: null,
    statusLabels: {
      working: 'WORKING CLOCK!',
      wrong: 'WRONG HAND SPEED',
    },
    layers: CLOCK_LAYERS,
    outputs: CLOCK_OUTPUTS,
  },
  orrery: {
    mode: 'orrery',
    title: 'Orrery Atelier',
    theme: 'orrery',
    layerSectionTitle: 'Planets',
    allowAddLayer: false,
    motorLabel: '1 rev/year',
    statusLabels: {
      working: 'WORKING ORRERY!',
      wrong: 'WRONG ORBIT SPEED',
    },
    layers: ORRERY_LAYERS,
    outputs: ORRERY_OUTPUTS,
  },
}

export function getModeConfig(mode: EditorMode) {
  return MODE_CONFIGS[mode]
}

export function getOutputForLayer(mode: EditorMode, layerOrder: number) {
  return MODE_CONFIGS[mode].outputs.find((output) => output.layerOrder === layerOrder) ?? null
}

export function getOutputById(mode: EditorMode, outputId: Exclude<AnchorId, 'motor'>) {
  return MODE_CONFIGS[mode].outputs.find((output) => output.id === outputId) ?? null
}

export function getOutputCenter(mode: EditorMode, outputId: Exclude<AnchorId, 'motor'>) {
  return getOutputById(mode, outputId)?.center ?? WORKSPACE_CENTER
}

export function getLayerName(mode: EditorMode, order: number) {
  if (mode === 'clock') {
    return HAND_LAYER_NAMES[order] ?? `Layer ${order}`
  }

  return getOutputForLayer(mode, order)?.label ?? `Layer ${order}`
}
