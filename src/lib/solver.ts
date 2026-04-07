import { MOTOR_CENTER, getModeConfig } from './constants'
import { distanceBetween, getLayerById, getPitchRadius, isPointCoaxial } from './geometry'
import type { EditorMode, Gear, Layer, OutputState, TrainAnalysis } from './types'

interface Edge {
  to: string
  ratio: number
}

function createEmptyOutputState(output: ReturnType<typeof getModeConfig>['outputs'][number]): OutputState {
  return {
    id: output.id,
    label: output.label,
    rpm: null,
    driven: false,
    conflicts: false,
    correct: false,
    targetRpm: output.targetRpm,
  }
}

function isMotorBound(gear: Gear) {
  return isPointCoaxial(gear.center, MOTOR_CENTER)
}

function isPointOnOutputCenter(
  point: Gear['center'],
  outputs: ReturnType<typeof getModeConfig>['outputs'],
) {
  return outputs.some((output) => isPointCoaxial(point, output.center))
}

export function resolveModeStatus(
  mode: EditorMode,
  outputStates: TrainAnalysis['outputStates'],
  outputs = getModeConfig(mode).outputs,
) {
  const anyDrivenWrong = outputs.some((output) => {
    const current = outputStates[output.id]
    return current?.driven && (!current.correct || current.conflicts)
  })
  const allCorrect = outputs.every((output) => outputStates[output.id]?.correct)

  if (mode === 'orrery') {
    const earthState = outputStates.earthArbor

    if (earthState?.correct && !anyDrivenWrong) {
      return { kind: 'working' as const, label: getModeConfig(mode).statusLabels.working }
    }

    if (anyDrivenWrong) {
      return { kind: 'wrong' as const, label: getModeConfig(mode).statusLabels.wrong }
    }

    return null
  }

  if (allCorrect) {
    return { kind: 'working' as const, label: getModeConfig(mode).statusLabels.working }
  }

  if (anyDrivenWrong) {
    return { kind: 'wrong' as const, label: getModeConfig(mode).statusLabels.wrong }
  }

  return null
}

export function analyzeClockwork(
  mode: EditorMode,
  gears: Gear[],
  layers: Layer[],
  outputs = getModeConfig(mode).outputs,
): TrainAnalysis {
  const computedByGearId: TrainAnalysis['computedByGearId'] = {}
  const adjacency = new Map<string, Edge[]>()
  const gearById = new Map<string, Gear>()

  for (const gear of gears) {
    adjacency.set(gear.id, [])
    gearById.set(gear.id, gear)
    computedByGearId[gear.id] = {
      rpm: null,
      drivenByMotor: false,
      conflicts: false,
    }
  }

  for (let index = 0; index < gears.length; index += 1) {
    const gearA = gears[index]

    for (let innerIndex = index + 1; innerIndex < gears.length; innerIndex += 1) {
      const gearB = gears[innerIndex]

      if (gearA.layerId === gearB.layerId) {
        const distance = distanceBetween(gearA.center, gearB.center)
        const meshDistance = getPitchRadius(gearA.teeth) + getPitchRadius(gearB.teeth)

        if (Math.abs(distance - meshDistance) <= 0.75) {
          adjacency.get(gearA.id)?.push({ to: gearB.id, ratio: -gearA.teeth / gearB.teeth })
          adjacency.get(gearB.id)?.push({ to: gearA.id, ratio: -gearB.teeth / gearA.teeth })
        }

        continue
      }

      if (!isPointCoaxial(gearA.center, gearB.center)) {
        continue
      }

      if (isPointOnOutputCenter(gearA.center, outputs)) {
        continue
      }

      adjacency.get(gearA.id)?.push({ to: gearB.id, ratio: 1 })
      adjacency.get(gearB.id)?.push({ to: gearA.id, ratio: 1 })
    }
  }

  const visited = new Set<string>()

  for (const gear of gears) {
    if (visited.has(gear.id)) {
      continue
    }

    const componentIds: string[] = []
    const stack = [gear.id]

    while (stack.length > 0) {
      const gearId = stack.pop()
      if (!gearId || visited.has(gearId)) {
        continue
      }

      visited.add(gearId)
      componentIds.push(gearId)

      for (const edge of adjacency.get(gearId) ?? []) {
        if (!visited.has(edge.to)) {
          stack.push(edge.to)
        }
      }
    }

    const sourceIds = componentIds.filter((gearId) => {
      const currentGear = gearById.get(gearId)
      return currentGear ? isMotorBound(currentGear) : false
    })

    if (sourceIds.length === 0) {
      continue
    }

    const assignedRpmByGearId = new Map<string, number>()
    const queue = [...sourceIds]
    let conflict = false

    for (const sourceId of sourceIds) {
      assignedRpmByGearId.set(sourceId, 1)
    }

    while (queue.length > 0) {
      const gearId = queue.shift()
      if (!gearId) {
        continue
      }

      const rpm = assignedRpmByGearId.get(gearId)
      if (rpm === undefined) {
        continue
      }

      for (const edge of adjacency.get(gearId) ?? []) {
        const expectedRpm = rpm * edge.ratio
        const currentRpm = assignedRpmByGearId.get(edge.to)

        if (currentRpm === undefined) {
          assignedRpmByGearId.set(edge.to, expectedRpm)
          queue.push(edge.to)
          continue
        }

        if (Math.abs(currentRpm - expectedRpm) > 0.0001) {
          conflict = true
        }
      }
    }

    for (const componentGearId of componentIds) {
      computedByGearId[componentGearId] = {
        rpm: conflict ? null : (assignedRpmByGearId.get(componentGearId) ?? null),
        drivenByMotor: true,
        conflicts: conflict,
      }
    }
  }

  const outputStates = Object.fromEntries(
    outputs.map((output) => [output.id, createEmptyOutputState(output)]),
  ) as TrainAnalysis['outputStates']

  for (const gear of gears) {
    const layer = getLayerById(layers, gear.layerId)
    if (!layer) {
      continue
    }

    const output = outputs.find((currentOutput) => currentOutput.layerOrder === layer.order)
    if (!output || !isPointCoaxial(gear.center, output.center) || !(output.id in outputStates)) {
      continue
    }

    const computedState = computedByGearId[gear.id]
    const rpm = computedState?.rpm ?? null
    const correct = rpm !== null && Math.abs(rpm - output.targetRpm) <= output.targetRpm * 0.001

    outputStates[output.id] = {
      id: output.id,
      label: output.label,
      rpm,
      driven: computedState?.drivenByMotor ?? false,
      conflicts: computedState?.conflicts ?? false,
      correct,
      targetRpm: output.targetRpm,
    }
  }

  return {
    computedByGearId,
    outputStates,
    status: resolveModeStatus(mode, outputStates, outputs),
  }
}
