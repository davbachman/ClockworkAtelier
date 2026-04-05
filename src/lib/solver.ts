import {
  ARBOR_BY_LAYER_ORDER,
  CLOCK_CENTER,
  EXACT_POSITION_EPSILON,
  HAND_TARGET_RPM,
  MOTOR_CENTER,
} from './constants'
import { distanceBetween, getLayerById, getPitchRadius, isPointCoaxial } from './geometry'
import type { ClockAnalysis, Gear, HandState, Layer } from './types'

interface Edge {
  to: string
  ratio: number
}

const HAND_ORDER = ['secondArbor', 'minuteArbor', 'hourArbor'] as const

function createEmptyHandState(anchor: (typeof HAND_ORDER)[number]): HandState {
  return {
    anchor,
    rpm: null,
    driven: false,
    conflicts: false,
    correct: false,
  }
}

function isMotorBound(gear: Gear) {
  return isPointCoaxial(gear.center, MOTOR_CENTER)
}

export function resolveClockStatus(handStates: ClockAnalysis['handStates']) {
  const allCorrect = HAND_ORDER.every((anchor) => handStates[anchor].correct)
  const anyDrivenWrong = HAND_ORDER.some((anchor) => {
    const hand = handStates[anchor]
    return hand.driven && (!hand.correct || hand.conflicts)
  })

  if (allCorrect) {
    return { kind: 'working' as const, label: 'WORKING CLOCK!' }
  }

  if (anyDrivenWrong) {
    return { kind: 'wrong' as const, label: 'WRONG HAND SPEED' }
  }

  return null
}

export function analyzeClockwork(gears: Gear[], layers: Layer[]): ClockAnalysis {
  const computedByGearId: ClockAnalysis['computedByGearId'] = {}
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

        if (Math.abs(distance - meshDistance) <= EXACT_POSITION_EPSILON) {
          adjacency.get(gearA.id)?.push({ to: gearB.id, ratio: -gearA.teeth / gearB.teeth })
          adjacency.get(gearB.id)?.push({ to: gearA.id, ratio: -gearB.teeth / gearA.teeth })
        }

        continue
      }

      if (!isPointCoaxial(gearA.center, gearB.center)) {
        continue
      }

      if (isPointCoaxial(gearA.center, CLOCK_CENTER)) {
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

  const handStates = {
    secondArbor: createEmptyHandState('secondArbor'),
    minuteArbor: createEmptyHandState('minuteArbor'),
    hourArbor: createEmptyHandState('hourArbor'),
  }

  for (const gear of gears) {
    if (!isPointCoaxial(gear.center, CLOCK_CENTER)) {
      continue
    }

    const layer = getLayerById(layers, gear.layerId)
    if (!layer) {
      continue
    }

    const anchor = ARBOR_BY_LAYER_ORDER[layer.order]
    if (!anchor) {
      continue
    }

    const computedState = computedByGearId[gear.id]
    const rpm = computedState?.rpm ?? null
    const correct =
      rpm !== null && Math.abs(rpm - HAND_TARGET_RPM[anchor]) <= HAND_TARGET_RPM[anchor] * 0.001

    handStates[anchor] = {
      anchor,
      rpm,
      driven: computedState?.drivenByMotor ?? false,
      conflicts: computedState?.conflicts ?? false,
      correct,
    }
  }

  return {
    computedByGearId,
    handStates,
    status: resolveClockStatus(handStates),
  }
}
