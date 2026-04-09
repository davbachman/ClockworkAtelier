import {
  COAXIAL_SNAP_TOLERANCE,
  EXACT_POSITION_EPSILON,
  MAX_TEETH,
  MESH_SNAP_TOLERANCE,
  MIN_TEETH,
  MOTOR_CENTER,
  TOOTH_DEPTH,
  TOOTH_PITCH,
  getModeConfig,
  getOutputById,
  getOutputForLayer,
} from './constants'
import type {
  AnchorId,
  EditorMode,
  Gear,
  Layer,
  PlacementResult,
  Point,
} from './types'

export function clampTeethCount(value: number) {
  return Math.min(MAX_TEETH, Math.max(MIN_TEETH, Math.round(value)))
}

export function getPitchRadius(teeth: number) {
  return (teeth * TOOTH_PITCH) / (2 * Math.PI)
}

export function getOuterRadius(teeth: number) {
  return getPitchRadius(teeth) + TOOTH_DEPTH / 2
}

export function getRootRadius(teeth: number) {
  return Math.max(getPitchRadius(teeth) - TOOTH_DEPTH / 2, getPitchRadius(teeth) * 0.72)
}

export function distanceBetween(pointA: Point, pointB: Point) {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y)
}

export function addPoints(pointA: Point, pointB: Point): Point {
  return { x: pointA.x + pointB.x, y: pointA.y + pointB.y }
}

export function subtractPoints(pointA: Point, pointB: Point): Point {
  return { x: pointA.x - pointB.x, y: pointA.y - pointB.y }
}

export function scalePoint(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor }
}

export function isPointCoaxial(pointA: Point, pointB: Point) {
  return distanceBetween(pointA, pointB) <= EXACT_POSITION_EPSILON
}

export function getLayerById(layers: Layer[], layerId: string) {
  return layers.find((layer) => layer.id === layerId) ?? null
}

function isPointOnOutputCenter(
  mode: EditorMode,
  point: Point,
  outputs = getModeConfig(mode).outputs,
) {
  return outputs.some((output) => isPointCoaxial(point, output.center))
}

export function getLayerVisualState(layerOrder: number, activeLayerOrder: number | null) {
  if (activeLayerOrder === null) {
    return 'neutral'
  }

  if (layerOrder === activeLayerOrder) {
    return 'active'
  }

  return layerOrder > activeLayerOrder ? 'above' : 'below'
}

export function createGearPath(center: Point, teeth: number) {
  const safeTeeth = clampTeethCount(teeth)
  const rootRadius = getRootRadius(safeTeeth)
  const outerRadius = getOuterRadius(safeTeeth)
  const points: string[] = []
  const toothAngle = (Math.PI * 2) / safeTeeth
  const rootFlatFraction = 0.28
  const tipFlatFraction = 0.24
  const flankFraction = (1 - rootFlatFraction - tipFlatFraction) / 2

  for (let toothIndex = 0; toothIndex < safeTeeth; toothIndex += 1) {
    const startAngle = toothIndex * toothAngle - Math.PI / 2
    const rootStartAngle = startAngle
    const rootEndAngle = startAngle + toothAngle * rootFlatFraction
    const tipStartAngle = rootEndAngle + toothAngle * flankFraction
    const tipEndAngle = tipStartAngle + toothAngle * tipFlatFraction
    const rootNextStartAngle = startAngle + toothAngle

    const rootStartPoint = {
      x: center.x + Math.cos(rootStartAngle) * rootRadius,
      y: center.y + Math.sin(rootStartAngle) * rootRadius,
    }
    const rootEndPoint = {
      x: center.x + Math.cos(rootEndAngle) * rootRadius,
      y: center.y + Math.sin(rootEndAngle) * rootRadius,
    }
    const tipStartPoint = {
      x: center.x + Math.cos(tipStartAngle) * outerRadius,
      y: center.y + Math.sin(tipStartAngle) * outerRadius,
    }
    const tipEndPoint = {
      x: center.x + Math.cos(tipEndAngle) * outerRadius,
      y: center.y + Math.sin(tipEndAngle) * outerRadius,
    }
    const rootNextStartPoint = {
      x: center.x + Math.cos(rootNextStartAngle) * rootRadius,
      y: center.y + Math.sin(rootNextStartAngle) * rootRadius,
    }

    if (toothIndex === 0) {
      points.push(`M ${rootStartPoint.x.toFixed(3)} ${rootStartPoint.y.toFixed(3)}`)
    }

    points.push(
      `L ${rootEndPoint.x.toFixed(3)} ${rootEndPoint.y.toFixed(3)}`,
      `L ${tipStartPoint.x.toFixed(3)} ${tipStartPoint.y.toFixed(3)}`,
      `L ${tipEndPoint.x.toFixed(3)} ${tipEndPoint.y.toFixed(3)}`,
      `L ${rootNextStartPoint.x.toFixed(3)} ${rootNextStartPoint.y.toFixed(3)}`,
    )
  }

  return `${points.join(' ')} Z`
}

function getCircleIntersectionPoints(
  centerA: Point,
  radiusA: number,
  centerB: Point,
  radiusB: number,
) {
  const delta = subtractPoints(centerB, centerA)
  const distance = Math.hypot(delta.x, delta.y)

  if (
    distance <= EXACT_POSITION_EPSILON ||
    distance > radiusA + radiusB + EXACT_POSITION_EPSILON ||
    distance < Math.abs(radiusA - radiusB) - EXACT_POSITION_EPSILON
  ) {
    return []
  }

  const distanceAlongCenterline =
    (radiusA * radiusA - radiusB * radiusB + distance * distance) / (2 * distance)
  const heightSquared = radiusA * radiusA - distanceAlongCenterline * distanceAlongCenterline

  if (heightSquared < -EXACT_POSITION_EPSILON) {
    return []
  }

  const height = Math.sqrt(Math.max(0, heightSquared))
  const midpoint = {
    x: centerA.x + (delta.x * distanceAlongCenterline) / distance,
    y: centerA.y + (delta.y * distanceAlongCenterline) / distance,
  }

  if (height <= EXACT_POSITION_EPSILON) {
    return [midpoint]
  }

  const offset = {
    x: (-delta.y * height) / distance,
    y: (delta.x * height) / distance,
  }

  return [
    addPoints(midpoint, offset),
    subtractPoints(midpoint, offset),
  ]
}

function createMeshSnapCenter(target: Point, current: Point, distance: number): Point {
  const delta = subtractPoints(current, target)
  const length = Math.hypot(delta.x, delta.y)

  if (length <= EXACT_POSITION_EPSILON) {
    return { x: target.x + distance, y: target.y }
  }

  const scale = distance / length
  return addPoints(target, scalePoint(delta, scale))
}

interface ResolvePlacementInput {
  mode: EditorMode
  draftGear: Pick<Gear, 'teeth' | 'layerId' | 'center'>
  gears: Gear[]
  layers: Layer[]
  excludeGearId?: string | null
}

interface TrainEdge {
  to: string
  ratio: number
}

function buildTrainAdjacency(mode: EditorMode, gears: Gear[], outputs = getModeConfig(mode).outputs) {
  const adjacency = new Map<string, TrainEdge[]>()

  for (const gear of gears) {
    adjacency.set(gear.id, [])
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

      if (
        !isPointCoaxial(gearA.center, gearB.center) ||
        isPointOnOutputCenter(mode, gearA.center, outputs)
      ) {
        continue
      }

      adjacency.get(gearA.id)?.push({ to: gearB.id, ratio: 1 })
      adjacency.get(gearB.id)?.push({ to: gearA.id, ratio: 1 })
    }
  }

  return adjacency
}

function collectCycleGearIds(
  gearIdA: string,
  gearIdB: string,
  parentByGearId: Map<string, string | null>,
  depthByGearId: Map<string, number>,
) {
  const cycleGearIds = new Set<string>()
  let currentA: string | null = gearIdA
  let currentB: string | null = gearIdB
  let depthA = depthByGearId.get(gearIdA) ?? 0
  let depthB = depthByGearId.get(gearIdB) ?? 0

  while (currentA && depthA > depthB) {
    cycleGearIds.add(currentA)
    currentA = parentByGearId.get(currentA) ?? null
    depthA -= 1
  }

  while (currentB && depthB > depthA) {
    cycleGearIds.add(currentB)
    currentB = parentByGearId.get(currentB) ?? null
    depthB -= 1
  }

  while (currentA && currentB && currentA !== currentB) {
    cycleGearIds.add(currentA)
    cycleGearIds.add(currentB)
    currentA = parentByGearId.get(currentA) ?? null
    currentB = parentByGearId.get(currentB) ?? null
  }

  if (currentA && currentA === currentB) {
    cycleGearIds.add(currentA)
  }

  return Array.from(cycleGearIds)
}

function findLoopConflictGearIds(mode: EditorMode, gears: Gear[], draftGearId: string) {
  const adjacency = buildTrainAdjacency(mode, gears)
  if (!adjacency.has(draftGearId)) {
    return []
  }

  const assignedRatioByGearId = new Map<string, number>([[draftGearId, 1]])
  const parentByGearId = new Map<string, string | null>([[draftGearId, null]])
  const depthByGearId = new Map<string, number>([[draftGearId, 0]])
  const queue = [draftGearId]
  const conflictGearIds = new Set<string>()

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const gearId = queue[queueIndex]
    const currentRatio = assignedRatioByGearId.get(gearId)
    if (currentRatio === undefined) {
      continue
    }

    for (const edge of adjacency.get(gearId) ?? []) {
      const expectedRatio = currentRatio * edge.ratio
      const assignedRatio = assignedRatioByGearId.get(edge.to)

      if (assignedRatio === undefined) {
        assignedRatioByGearId.set(edge.to, expectedRatio)
        parentByGearId.set(edge.to, gearId)
        depthByGearId.set(edge.to, (depthByGearId.get(gearId) ?? 0) + 1)
        queue.push(edge.to)
        continue
      }

      if (Math.abs(assignedRatio - expectedRatio) > 0.0001) {
        for (const conflictGearId of collectCycleGearIds(
          gearId,
          edge.to,
          parentByGearId,
          depthByGearId,
        )) {
          conflictGearIds.add(conflictGearId)
        }
      }
    }
  }

  if (!conflictGearIds.has(draftGearId)) {
    return []
  }

  conflictGearIds.delete(draftGearId)
  return Array.from(conflictGearIds)
}

function collectLoopPlacementConflicts({
  mode,
  center,
  comparableGears,
  draftGear,
  draftGearId,
}: {
  mode: EditorMode
  center: Point
  comparableGears: Gear[]
  draftGear: Pick<Gear, 'teeth' | 'layerId'>
  draftGearId: string
}) {
  return findLoopConflictGearIds(
    mode,
    [
      ...comparableGears,
      {
        id: draftGearId,
        teeth: draftGear.teeth,
        layerId: draftGear.layerId,
        center,
      },
    ],
    draftGearId,
  )
}

function collectPlacementConflicts({
  mode,
  center,
  sameLayerGears,
  otherLayerGears,
  draftRadius,
  draftOuterRadius,
  allowedAnchor,
}: {
  mode: EditorMode
  center: Point
  sameLayerGears: Gear[]
  otherLayerGears: Gear[]
  draftRadius: number
  draftOuterRadius: number
  allowedAnchor: Exclude<AnchorId, 'motor'> | null
}) {
  const invalidGearIds = new Set<string>()
  const invalidAnchors = new Set<AnchorId>()

  for (const gear of sameLayerGears) {
    const targetDistance = draftRadius + getPitchRadius(gear.teeth)
    const currentDistance = distanceBetween(center, gear.center)

    if (currentDistance < targetDistance - EXACT_POSITION_EPSILON) {
      invalidGearIds.add(gear.id)
    }
  }

  for (const gear of otherLayerGears) {
    const currentDistance = distanceBetween(center, gear.center)
    const otherRadius = getPitchRadius(gear.teeth)

    if (
      !isPointCoaxial(center, gear.center) &&
      currentDistance < Math.max(draftRadius, otherRadius) - EXACT_POSITION_EPSILON
    ) {
      invalidGearIds.add(gear.id)
    }
  }

  const distanceToMotor = distanceBetween(center, MOTOR_CENTER)
  if (
    !isPointCoaxial(center, MOTOR_CENTER) &&
    distanceToMotor < draftRadius - EXACT_POSITION_EPSILON
  ) {
    invalidAnchors.add('motor')
  }

  if (allowedAnchor) {
    const allowedOutput = getOutputById(mode, allowedAnchor)
    const allowedArborRadius = allowedOutput?.arborRadius ?? 0
    const distanceToAllowedOutput = allowedOutput ? distanceBetween(center, allowedOutput.center) : Infinity
    const isAllowedOutputOccupied =
      allowedOutput !== null &&
      sameLayerGears.some((gear) => isPointCoaxial(gear.center, allowedOutput.center))

    if (
      allowedOutput &&
      !isAllowedOutputOccupied &&
      !isPointCoaxial(center, allowedOutput.center) &&
      distanceToAllowedOutput < draftOuterRadius + allowedArborRadius - EXACT_POSITION_EPSILON
    ) {
      invalidAnchors.add(allowedAnchor)
    }
  } else {
    for (const output of getModeConfig(mode).outputs) {
      const distanceToOutput = distanceBetween(center, output.center)
      if (distanceToOutput < draftOuterRadius + output.arborRadius - EXACT_POSITION_EPSILON) {
        invalidAnchors.add(output.id)
      }
    }
  }

  return {
    invalidGearIds: Array.from(invalidGearIds),
    invalidAnchors: Array.from(invalidAnchors),
  }
}

function enrichSatisfiedConstraints({
  mode,
  center,
  sameLayerGears,
  otherLayerGears,
  draftRadius,
  allowedAnchor,
  highlightedGearIds,
  highlightedAnchors,
}: {
  mode: EditorMode
  center: Point
  sameLayerGears: Gear[]
  otherLayerGears: Gear[]
  draftRadius: number
  allowedAnchor: Exclude<AnchorId, 'motor'> | null
  highlightedGearIds: string[]
  highlightedAnchors: AnchorId[]
}) {
  const nextGearIds = new Set(highlightedGearIds)
  const nextAnchors = new Set<AnchorId>(highlightedAnchors)

  for (const gear of sameLayerGears) {
    const targetDistance = draftRadius + getPitchRadius(gear.teeth)
    if (Math.abs(distanceBetween(center, gear.center) - targetDistance) <= EXACT_POSITION_EPSILON) {
      nextGearIds.add(gear.id)
    }
  }

  for (const gear of otherLayerGears) {
    if (isPointCoaxial(center, gear.center)) {
      nextGearIds.add(gear.id)
    }
  }

  if (isPointCoaxial(center, MOTOR_CENTER)) {
    nextAnchors.add('motor')
  }

  if (allowedAnchor) {
    const allowedOutput = getOutputById(mode, allowedAnchor)
    if (allowedOutput && isPointCoaxial(center, allowedOutput.center)) {
      nextAnchors.add(allowedAnchor)
    }
  }

  return {
    highlightedGearIds: Array.from(nextGearIds),
    highlightedAnchors: Array.from(nextAnchors),
  }
}

export function resolvePlacement({
  mode,
  draftGear,
  gears,
  layers,
  excludeGearId = null,
}: ResolvePlacementInput): PlacementResult {
  const layer = getLayerById(layers, draftGear.layerId)

  if (!layer) {
    return {
      center: draftGear.center,
      state: 'free',
      highlightedAnchors: [],
      highlightedGearIds: [],
    }
  }

  const comparableGears = gears.filter((gear) => gear.id !== excludeGearId)
  const draftGearId = excludeGearId ?? '__placement-draft__'
  const sameLayerGears = comparableGears.filter((gear) => gear.layerId === draftGear.layerId)
  const otherLayerGears = comparableGears.filter((gear) => gear.layerId !== draftGear.layerId)
  const draftRadius = getPitchRadius(draftGear.teeth)
  const draftOuterRadius = getOuterRadius(draftGear.teeth)
  const allowedOutput = getOutputForLayer(mode, layer.order) ?? null
  const allowedAnchor = allowedOutput?.id ?? null
  const snapCandidates: Array<PlacementResult & { delta: number; priority: number }> = []

  if (allowedOutput) {
    const delta = distanceBetween(draftGear.center, allowedOutput.center)
    if (delta <= COAXIAL_SNAP_TOLERANCE) {
      snapCandidates.push({
        center: allowedOutput.center,
        state: 'coaxialSnap',
        highlightedAnchors: [allowedOutput.id],
        highlightedGearIds: [],
        delta,
        priority: 0,
      })
    }
  }

  {
    const delta = distanceBetween(draftGear.center, MOTOR_CENTER)
    if (delta <= COAXIAL_SNAP_TOLERANCE) {
      snapCandidates.push({
        center: MOTOR_CENTER,
        state: 'coaxialSnap',
        highlightedAnchors: ['motor'],
        highlightedGearIds: [],
        delta,
        priority: 1,
      })
    }
  }

  for (const gear of otherLayerGears) {
    if (isPointOnOutputCenter(mode, gear.center)) {
      continue
    }

    const delta = distanceBetween(draftGear.center, gear.center)
    if (delta <= COAXIAL_SNAP_TOLERANCE) {
      snapCandidates.push({
        center: gear.center,
        state: 'coaxialSnap',
        highlightedAnchors: [],
        highlightedGearIds: [gear.id],
        delta,
        priority: 2,
      })
    }
  }

  for (const gear of sameLayerGears) {
    const targetDistance = draftRadius + getPitchRadius(gear.teeth)
    const currentDistance = distanceBetween(draftGear.center, gear.center)
    const delta = Math.abs(currentDistance - targetDistance)

    if (delta <= MESH_SNAP_TOLERANCE) {
      snapCandidates.push({
        center: createMeshSnapCenter(gear.center, draftGear.center, targetDistance),
        state: 'meshSnap',
        highlightedAnchors: [],
        highlightedGearIds: [gear.id],
        delta,
        priority: 3,
      })
    }
  }

  for (let index = 0; index < sameLayerGears.length; index += 1) {
    const gearA = sameLayerGears[index]
    const targetDistanceA = draftRadius + getPitchRadius(gearA.teeth)
    const currentDeltaA = Math.abs(distanceBetween(draftGear.center, gearA.center) - targetDistanceA)

    if (currentDeltaA > MESH_SNAP_TOLERANCE) {
      continue
    }

    for (let innerIndex = index + 1; innerIndex < sameLayerGears.length; innerIndex += 1) {
      const gearB = sameLayerGears[innerIndex]
      const targetDistanceB = draftRadius + getPitchRadius(gearB.teeth)
      const currentDeltaB =
        Math.abs(distanceBetween(draftGear.center, gearB.center) - targetDistanceB)

      if (currentDeltaB > MESH_SNAP_TOLERANCE) {
        continue
      }

      for (const intersection of getCircleIntersectionPoints(
        gearA.center,
        targetDistanceA,
        gearB.center,
        targetDistanceB,
      )) {
        const distanceToIntersection = distanceBetween(draftGear.center, intersection)
        const delta = Math.max(currentDeltaA, currentDeltaB)

        if (distanceToIntersection <= MESH_SNAP_TOLERANCE) {
          snapCandidates.push({
            center: intersection,
            state: 'meshSnap',
            highlightedAnchors: [],
            highlightedGearIds: [gearA.id, gearB.id],
            delta,
            priority: 2.5,
          })
        }
      }
    }
  }

  snapCandidates.sort(
    (candidateA, candidateB) =>
      candidateA.delta - candidateB.delta || candidateA.priority - candidateB.priority,
  )
  const scoredCandidates = snapCandidates.map((candidate) => {
    const conflicts = collectPlacementConflicts({
      mode,
      center: candidate.center,
      sameLayerGears,
      otherLayerGears,
      draftRadius,
      draftOuterRadius,
      allowedAnchor,
    })
    const enriched = enrichSatisfiedConstraints({
      mode,
      center: candidate.center,
      sameLayerGears,
      otherLayerGears,
      draftRadius,
      allowedAnchor,
      highlightedGearIds: candidate.highlightedGearIds,
      highlightedAnchors: candidate.highlightedAnchors,
    })
    const loopConflictGearIds =
      conflicts.invalidGearIds.length === 0 && conflicts.invalidAnchors.length === 0
        ? collectLoopPlacementConflicts({
            mode,
            center: candidate.center,
            comparableGears,
            draftGear,
            draftGearId,
          })
        : []

    return {
      ...candidate,
      ...conflicts,
      ...enriched,
      loopConflictGearIds,
      constraintCount: enriched.highlightedGearIds.length + enriched.highlightedAnchors.length,
    }
  })

  function comparePreferredSnapCandidates(
    candidateA: { constraintCount: number; delta: number; priority: number },
    candidateB: { constraintCount: number; delta: number; priority: number },
  ) {
    return (
      candidateB.constraintCount - candidateA.constraintCount ||
      candidateA.delta - candidateB.delta ||
      candidateA.priority - candidateB.priority
    )
  }

  const validSnapCandidates = scoredCandidates
    .filter(
      (candidate) =>
        candidate.invalidGearIds.length === 0 &&
        candidate.invalidAnchors.length === 0 &&
        candidate.loopConflictGearIds.length === 0,
    )
    .sort(comparePreferredSnapCandidates)

  const bestValidSnap = validSnapCandidates[0] ?? null
  const loopConflictSnapCandidates = scoredCandidates
    .filter(
      (candidate) =>
        candidate.invalidGearIds.length === 0 &&
        candidate.invalidAnchors.length === 0 &&
        candidate.loopConflictGearIds.length > 0,
    )
    .sort(comparePreferredSnapCandidates)
  const bestLoopConflictSnap = loopConflictSnapCandidates[0] ?? null

  if (
    bestLoopConflictSnap &&
    (!bestValidSnap || comparePreferredSnapCandidates(bestLoopConflictSnap, bestValidSnap) <= 0)
  ) {
    return {
      center: bestLoopConflictSnap.center,
      state: 'invalidLoop',
      highlightedAnchors: [],
      highlightedGearIds: bestLoopConflictSnap.loopConflictGearIds,
    }
  }

  if (bestValidSnap) {
    return {
      center: bestValidSnap.center,
      state: bestValidSnap.state,
      highlightedAnchors: bestValidSnap.highlightedAnchors,
      highlightedGearIds: bestValidSnap.highlightedGearIds,
    }
  }

  const freeConflicts = collectPlacementConflicts({
    mode,
    center: draftGear.center,
    sameLayerGears,
    otherLayerGears,
    draftRadius,
    draftOuterRadius,
    allowedAnchor,
  })
  const freeLoopConflictGearIds =
    freeConflicts.invalidGearIds.length === 0 && freeConflicts.invalidAnchors.length === 0
      ? collectLoopPlacementConflicts({
          mode,
          center: draftGear.center,
          comparableGears,
          draftGear,
          draftGearId,
        })
      : []

  if (
    freeConflicts.invalidGearIds.length === 0 &&
    freeConflicts.invalidAnchors.length === 0 &&
    freeLoopConflictGearIds.length === 0
  ) {
    return {
      center: draftGear.center,
      state: 'free',
      highlightedAnchors: [],
      highlightedGearIds: [],
    }
  }

  const bestInvalidSnap = scoredCandidates[0] ?? null
  if (bestInvalidSnap) {
    if (
      bestInvalidSnap.invalidGearIds.length === 0 &&
      bestInvalidSnap.invalidAnchors.length === 0 &&
      bestInvalidSnap.loopConflictGearIds.length > 0
    ) {
      return {
        center: bestInvalidSnap.center,
        state: 'invalidLoop',
        highlightedAnchors: [],
        highlightedGearIds: bestInvalidSnap.loopConflictGearIds,
      }
    }

    return {
      center: bestInvalidSnap.center,
      state: 'invalidOverlap',
      highlightedAnchors: bestInvalidSnap.invalidAnchors,
      highlightedGearIds: bestInvalidSnap.invalidGearIds,
    }
  }

  if (freeLoopConflictGearIds.length > 0) {
    return {
      center: draftGear.center,
      state: 'invalidLoop',
      highlightedAnchors: [],
      highlightedGearIds: freeLoopConflictGearIds,
    }
  }

  return {
    center: draftGear.center,
    state: 'invalidOverlap',
    highlightedAnchors: freeConflicts.invalidAnchors,
    highlightedGearIds: freeConflicts.invalidGearIds,
  }
}
