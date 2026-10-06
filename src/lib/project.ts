import { z } from 'zod'
import { MAX_TEETH, MIN_TEETH, MODE_CONFIGS, OPTIONAL_LAYER_IDS } from './constants'
import type {
  AtelierProjectV2,
  ClockworkProjectV1,
  EditorMode,
  Gear,
  Layer,
  WorkspaceProjectSlice,
} from './types'

const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().positive(),
})

const gearSchema = z.object({
  id: z.string().min(1),
  teeth: z.number().int().min(MIN_TEETH).max(MAX_TEETH),
  layerId: z.string().min(1),
  center: pointSchema,
})

const workspaceSliceSchema = z
  .object({
    layers: z.array(layerSchema).min(1),
    gears: z.array(gearSchema),
    optionalLayerVisibility: z.record(z.string(), z.boolean()).optional(),
    camera: z.object({
      panX: z.number().finite(),
      panY: z.number().finite(),
    }),
  })
  .superRefine((project, context) => {
    const layerIds = new Set<string>()
    const layerOrders = new Set<number>()

    for (const layer of project.layers) {
      if (layerIds.has(layer.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate layer id: ${layer.id}`,
        })
      }

      if (layerOrders.has(layer.order)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate layer order: ${layer.order}`,
        })
      }

      layerIds.add(layer.id)
      layerOrders.add(layer.order)
    }

    const gearIds = new Set<string>()
    for (const gear of project.gears) {
      if (gearIds.has(gear.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate gear id: ${gear.id}` })
      }
      gearIds.add(gear.id)
      if (!layerIds.has(gear.layerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gear references unknown layer: ${gear.layerId}`,
        })
      }
    }
  })

const clockworkProjectV1Schema = workspaceSliceSchema.safeExtend({
  version: z.literal(1),
})

const atelierProjectV2Schema = z.object({
  version: z.literal(2),
  activeMode: z.enum(['clock', 'orrery']),
  clock: workspaceSliceSchema,
  orrery: workspaceSliceSchema,
})

function cloneLayers(layers: Layer[]) {
  return layers.map((layer) => ({ ...layer }))
}

function createDefaultWorkspaceSlice(mode: EditorMode): WorkspaceProjectSlice {
  return {
    layers: cloneLayers(MODE_CONFIGS[mode].layers),
    gears: [],
    camera: {
      panX: 0,
      panY: 0,
    },
  }
}

function normalizeWorkspaceSlice(
  layers: Layer[],
  gears: Gear[],
  camera: WorkspaceProjectSlice['camera'],
  optionalLayerVisibility?: Record<string, boolean>,
  mode: EditorMode = 'clock',
): WorkspaceProjectSlice {
  return {
    layers: [...layers].sort((layerA, layerB) => layerA.order - layerB.order),
    gears,
    camera,
    optionalLayerVisibility: optionalLayerVisibility ?? Object.fromEntries(
      OPTIONAL_LAYER_IDS[mode].map((id) => [id, gears.some((gear) => gear.layerId === id)]),
    ),
  }
}

export function parseProjectJson(text: string) {
  const raw = JSON.parse(text)

  if (raw?.version === 1) {
    const project = clockworkProjectV1Schema.parse(raw) satisfies ClockworkProjectV1
    return {
      version: 2,
      activeMode: 'clock',
      clock: normalizeWorkspaceSlice(project.layers, project.gears, project.camera),
      orrery: createDefaultWorkspaceSlice('orrery'),
    } satisfies AtelierProjectV2
  }

  const project = atelierProjectV2Schema.parse(raw) satisfies AtelierProjectV2
  return {
    version: 2,
    activeMode: project.activeMode,
    clock: normalizeWorkspaceSlice(project.clock.layers, project.clock.gears, project.clock.camera, project.clock.optionalLayerVisibility),
    orrery: normalizeWorkspaceSlice(
      project.orrery.layers,
      project.orrery.gears,
      project.orrery.camera,
      project.orrery.optionalLayerVisibility,
      'orrery',
    ),
  } satisfies AtelierProjectV2
}

export function serializeProject(project: AtelierProjectV2) {
  return JSON.stringify(project, null, 2)
}

export function buildProjectSnapshot(
  activeMode: EditorMode,
  workspaces: Record<EditorMode, WorkspaceProjectSlice>,
): AtelierProjectV2 {
  return {
    version: 2,
    activeMode,
    clock: normalizeWorkspaceSlice(
      workspaces.clock.layers,
      workspaces.clock.gears,
      workspaces.clock.camera,
      workspaces.clock.optionalLayerVisibility,
    ),
    orrery: normalizeWorkspaceSlice(
      workspaces.orrery.layers,
      workspaces.orrery.gears,
      workspaces.orrery.camera,
      workspaces.orrery.optionalLayerVisibility,
      'orrery',
    ),
  }
}

export function createEmptyWorkspaceProject(mode: EditorMode) {
  return createDefaultWorkspaceSlice(mode)
}
