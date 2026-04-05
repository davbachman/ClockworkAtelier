import { z } from 'zod'
import { MAX_TEETH, MIN_TEETH } from './constants'
import type { ClockworkProjectV1, Gear, Layer } from './types'

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

const projectSchema = z
  .object({
    version: z.literal(1),
    layers: z.array(layerSchema).min(1),
    gears: z.array(gearSchema),
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

    for (const gear of project.gears) {
      if (!layerIds.has(gear.layerId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gear references unknown layer: ${gear.layerId}`,
        })
      }
    }
  })

export function parseProjectJson(text: string) {
  return projectSchema.parse(JSON.parse(text)) satisfies ClockworkProjectV1
}

export function serializeProject(project: ClockworkProjectV1) {
  return JSON.stringify(project, null, 2)
}

export function buildProjectSnapshot(
  layers: Layer[],
  gears: Gear[],
  camera: ClockworkProjectV1['camera'],
): ClockworkProjectV1 {
  return {
    version: 1,
    layers: [...layers].sort((layerA, layerB) => layerA.order - layerB.order),
    gears,
    camera,
  }
}
