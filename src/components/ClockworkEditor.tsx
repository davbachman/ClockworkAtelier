import {
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react'
import type {
  ChangeEvent,
  MouseEvent as ReactClickEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  DIAL_INNER_RADIUS,
  DIAL_MIDDLE_RADIUS,
  DIAL_OUTER_RADIUS,
  GEAR_BORE_RADIUS,
  MAX_TEETH,
  MIN_TEETH,
  MOTOR_AXLE_RADIUS,
  MOTOR_CENTER,
  ROMAN_NUMERALS,
  WEEKDAY_NAMES,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  WORKSPACE_CENTER,
  getModeConfig,
  getOutputForLayer,
  getOutputById,
} from '../lib/constants'
import {
  addPoints,
  clampTeethCount,
  createGearPath,
  getLayerById,
  getLayerVisualState,
  getOuterRadius,
  getRootRadius,
  resolvePlacement,
  scalePoint,
} from '../lib/geometry'
import { formatRpmFraction } from '../lib/fractions'
import { getAnimatedAngle } from '../lib/hands'
import { SUN_ART_ASSET, SUN_OCCLUDER_ASSET } from '../lib/orreryAssets'
import { PLANET_ASSETS } from '../lib/planetAssets'
import { buildProjectSnapshot, parseProjectJson, serializeProject } from '../lib/project'
import { analyzeClockwork } from '../lib/solver'
import { getDefaultPlacementPoint, useEditorStore } from '../store/editorStore'
import type {
  AnchorId,
  ComputedGearState,
  EditorMode,
  Gear,
  Layer,
  OutputTarget,
  PlacementResult,
  Point,
} from '../lib/types'

const GEAR_DRAG_THRESHOLD_PX = 4
const PLANET_SIZES: Record<string, number> = {
  mercury: 44,
  venus: 48,
  earth: 50,
  mars: 46,
  jupiter: 60,
  saturn: 72,
}
const SUN_IMAGE_SIZE = 140
const SUN_DISC_RADIUS = 52
const CLOCK_COMPLICATION_DIAL_RADIUS = 72
const CLOCK_DAY_INNER_RING_RADIUS = 46
const CLOCK_DAY_LABEL_RADIUS = 58
const CLOCK_AM_PM_HAND_LENGTH = 56
const CLOCK_DAY_HAND_LENGTH = 54
const OPTIONAL_LAYER_IDS_BY_MODE = {
  clock: ['layer-4', 'layer-5'],
  orrery: ['layer-5', 'layer-6'],
} as const
const DEFAULT_OPTIONAL_LAYER_VISIBILITY = {
  clock: {
    'layer-4': false,
    'layer-5': false,
  },
  orrery: {
    'layer-5': false,
    'layer-6': false,
  },
} as const

function isOptionalLayer(mode: EditorMode, layerId: string) {
  return OPTIONAL_LAYER_IDS_BY_MODE[mode].includes(layerId as never)
}

function getOptionalLayerVisibility(
  visibilityByMode: typeof DEFAULT_OPTIONAL_LAYER_VISIBILITY,
  mode: EditorMode,
  layerId: string,
) {
  if (!isOptionalLayer(mode, layerId)) {
    return true
  }

  return (visibilityByMode[mode] as Record<string, boolean>)[layerId] ?? false
}

function parseTeethInput(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    return null
  }

  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue) || parsedValue < MIN_TEETH || parsedValue > MAX_TEETH) {
    return null
  }

  return parsedValue
}

function getGearStyle(layer: Layer, activeLayerOrder: number | null) {
  if (activeLayerOrder === null) {
    return {
      opacity: 1,
      stroke: 'var(--gear-neutral-stroke)',
      fill: 'var(--paper)',
    }
  }

  const visualState = getLayerVisualState(layer.order, activeLayerOrder)

  if (visualState === 'above') {
    return {
      opacity: 'var(--gear-above-opacity)',
      stroke: 'var(--ink)',
      fill: 'var(--paper)',
    }
  }

  if (visualState === 'below') {
    return {
      opacity: 0.92,
      stroke: 'var(--gear-below)',
      fill: 'var(--paper-strong)',
    }
  }

  return {
    opacity: 1,
    stroke: 'var(--ink)',
    fill: 'var(--paper)',
  }
}

function getLayerStrokeStyle(layerOrder: number, activeLayerOrder: number | null) {
  const visualState = getLayerVisualState(layerOrder, activeLayerOrder)

  if (visualState === 'above') {
    return {
      opacity: 'var(--gear-above-opacity)',
      stroke: 'var(--ink)',
    }
  }

  if (visualState === 'below') {
    return {
      opacity: 0.92,
      stroke: 'var(--gear-below)',
    }
  }

  return {
    opacity: 1,
    stroke: 'var(--ink)',
  }
}

function getHighlightColor(state: PlacementResult['state']) {
  return isInvalidPlacementState(state) ? 'var(--signal-bad)' : 'var(--signal-good)'
}

function isInvalidPlacementState(state: PlacementResult['state']) {
  return state === 'invalidOverlap' || state === 'invalidLoop'
}

function getViewBox(camera: { panX: number; panY: number }) {
  return `${camera.panX - WORLD_WIDTH / 2} ${camera.panY - WORLD_HEIGHT / 2} ${WORLD_WIDTH} ${WORLD_HEIGHT}`
}

function getPointOnCircle(center: Point, radius: number, angle: number): Point {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

function getPointOnOrbit(radius: number, angleDegrees: number) {
  const angle = ((angleDegrees - 90) * Math.PI) / 180
  return getPointOnCircle(WORKSPACE_CENTER, radius, angle)
}

function createCirclePath(center: Point, radius: number) {
  const top = getPointOnCircle(center, radius, -Math.PI / 2)
  const bottom = getPointOnCircle(center, radius, Math.PI / 2)
  const safeRadius = radius.toFixed(3)

  return [
    `M ${top.x.toFixed(3)} ${top.y.toFixed(3)}`,
    `A ${safeRadius} ${safeRadius} 0 1 1 ${bottom.x.toFixed(3)} ${bottom.y.toFixed(3)}`,
    `A ${safeRadius} ${safeRadius} 0 1 1 ${top.x.toFixed(3)} ${top.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

function createArmPath(
  center: Point,
  innerRadius: number,
  outerRadius: number,
  angle: number,
  armWidth: number,
) {
  const halfWidth = armWidth / 2
  const radialUnit = { x: Math.cos(angle), y: Math.sin(angle) }
  const perpendicularUnit = { x: -radialUnit.y, y: radialUnit.x }
  const innerCenter = addPoints(center, scalePoint(radialUnit, innerRadius))
  const outerCenter = addPoints(center, scalePoint(radialUnit, outerRadius))
  const innerLeft = addPoints(innerCenter, scalePoint(perpendicularUnit, halfWidth))
  const outerLeft = addPoints(outerCenter, scalePoint(perpendicularUnit, halfWidth))
  const outerRight = addPoints(outerCenter, scalePoint(perpendicularUnit, -halfWidth))
  const innerRight = addPoints(innerCenter, scalePoint(perpendicularUnit, -halfWidth))

  return [
    `M ${innerLeft.x.toFixed(3)} ${innerLeft.y.toFixed(3)}`,
    `L ${outerLeft.x.toFixed(3)} ${outerLeft.y.toFixed(3)}`,
    `L ${outerRight.x.toFixed(3)} ${outerRight.y.toFixed(3)}`,
    `L ${innerRight.x.toFixed(3)} ${innerRight.y.toFixed(3)}`,
    'Z',
  ].join(' ')
}

function createWorldPointFromClient(
  svgElement: SVGSVGElement,
  clientX: number,
  clientY: number,
  camera: { panX: number; panY: number },
) {
  const bounds = svgElement.getBoundingClientRect()

  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }

  const minX = camera.panX - WORLD_WIDTH / 2
  const minY = camera.panY - WORLD_HEIGHT / 2

  return {
    x: minX + ((clientX - bounds.left) / bounds.width) * WORLD_WIDTH,
    y: minY + ((clientY - bounds.top) / bounds.height) * WORLD_HEIGHT,
  }
}

function createWorldDeltaFromClient(
  svgElement: SVGSVGElement,
  deltaX: number,
  deltaY: number,
) {
  const bounds = svgElement.getBoundingClientRect()

  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: (deltaX / bounds.width) * WORLD_WIDTH,
    y: (deltaY / bounds.height) * WORLD_HEIGHT,
  }
}

function isClientInsideElement(
  element: SVGSVGElement,
  clientX: number,
  clientY: number,
) {
  const bounds = element.getBoundingClientRect()

  return (
    bounds.width > 0 &&
    bounds.height > 0 &&
    clientX >= bounds.left &&
    clientX <= bounds.right &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom
  )
}

function getSafeWindowPosition(screenX: number, screenY: number, width: number, height: number) {
  if (typeof window === 'undefined') {
    return { left: screenX, top: screenY }
  }

  return {
    left: Math.min(screenX + 12, window.innerWidth - width),
    top: Math.min(screenY + 12, window.innerHeight - height),
  }
}

function renderPlanetOccluder(
  output: OutputTarget,
  point: Point,
  size: number,
  color: string,
) {
  if (output.assetId === 'saturn') {
    return (
      <g key={`occluder-${output.id}`}>
        <circle cx={point.x} cy={point.y} fill={color} r={size * 0.34} />
        <ellipse
          cx={point.x}
          cy={point.y}
          fill="none"
          rx={size * 0.64}
          ry={size * 0.18}
          stroke={color}
          strokeWidth={size * 0.18}
          transform={`rotate(-24 ${point.x} ${point.y})`}
        />
      </g>
    )
  }

  return <circle key={`occluder-${output.id}`} cx={point.x} cy={point.y} fill={color} r={size * 0.44} />
}

function renderSunGlyph() {
  return (
    <g data-testid="sun-overlay" pointerEvents="none">
      <circle
        cx={WORKSPACE_CENTER.x}
        cy={WORKSPACE_CENTER.y}
        r={SUN_DISC_RADIUS}
        fill="var(--orrery-planet-occluder)"
      />
      <image
        href={SUN_OCCLUDER_ASSET}
        x={WORKSPACE_CENTER.x - SUN_IMAGE_SIZE / 2}
        y={WORKSPACE_CENTER.y - SUN_IMAGE_SIZE / 2}
        width={SUN_IMAGE_SIZE}
        height={SUN_IMAGE_SIZE}
        preserveAspectRatio="xMidYMid meet"
      />
      <image
        href={SUN_ART_ASSET}
        x={WORKSPACE_CENTER.x - SUN_IMAGE_SIZE / 2}
        y={WORKSPACE_CENTER.y - SUN_IMAGE_SIZE / 2}
        width={SUN_IMAGE_SIZE}
        height={SUN_IMAGE_SIZE}
        preserveAspectRatio="xMidYMid meet"
      />
    </g>
  )
}

function GearGlyph({
  gear,
  layer,
  activeLayerOrder,
  computedState,
  playbackMs,
  isPlaying,
  isSelected,
  isDraft,
  highlightState,
  onPointerDown,
  pointerEvents,
}: {
  gear: Gear
  layer: Layer
  activeLayerOrder: number | null
  computedState: ComputedGearState | null
  playbackMs: number
  isPlaying: boolean
  isSelected: boolean
  isDraft: boolean
  highlightState: PlacementResult['state'] | null
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void
  pointerEvents?: 'none' | 'auto'
}) {
  const style = getGearStyle(layer, activeLayerOrder)
  const stroke = highlightState ? getHighlightColor(highlightState) : style.stroke
  const fill = highlightState
    ? isInvalidPlacementState(highlightState)
      ? 'rgba(190, 55, 38, 0.12)'
      : 'rgba(77, 135, 81, 0.12)'
    : style.fill
  const rootRadius = getRootRadius(gear.teeth)
  const outerRadius = getOuterRadius(gear.teeth)
  const gearOutlinePath = createGearPath(gear.center, clampTeethCount(gear.teeth))
  const availableInteriorRadius = rootRadius - GEAR_BORE_RADIUS
  const spokeCount = 5
  const hubRadius = GEAR_BORE_RADIUS + Math.min(9, Math.max(3.5, availableInteriorRadius * 0.14))
  const baseRimInset = Math.min(12, Math.max(6, availableInteriorRadius * 0.16))
  const rimInset = gear.teeth >= 150 ? baseRimInset * 2 : baseRimInset
  const rimInnerRadius = Math.max(hubRadius + 6, rootRadius - rimInset)
  const armWidth = Math.max(7.5, Math.min(12, availableInteriorRadius * 0.18))
  const canRenderWindows =
    gear.teeth > 30 &&
    availableInteriorRadius >= 24 &&
    rimInnerRadius - hubRadius >= 14 &&
    ((Math.PI * 2 * ((hubRadius + rimInnerRadius) / 2)) / spokeCount) - armWidth >= 10
  const hubRingPath = `${createCirclePath(gear.center, hubRadius)} ${createCirclePath(gear.center, GEAR_BORE_RADIUS)}`
  const rimRingPath = `${gearOutlinePath} ${createCirclePath(gear.center, rimInnerRadius)}`
  const gearHitRadius = (rootRadius + outerRadius) / 2
  const gearHitPath = createCirclePath(gear.center, gearHitRadius)
  const angle = (computedState?.rpm ?? 0) * 360 * (isPlaying ? playbackMs / 60000 : 0)

  return (
    <g
      data-testid={`gear-${gear.id}`}
      onPointerDown={onPointerDown}
      opacity={isDraft ? 1 : style.opacity}
      transform={`rotate(${angle} ${gear.center.x} ${gear.center.y})`}
    >
      {canRenderWindows ? (
        <>
          <path
            d={rimRingPath}
            fill={fill}
            fillRule="evenodd"
            pointerEvents="none"
            stroke={stroke}
            strokeLinejoin="round"
            strokeWidth={2}
          />
          {Array.from({ length: spokeCount }, (_, spokeIndex) => {
            const spokeCenterAngle = (Math.PI * 2 * spokeIndex) / spokeCount - Math.PI / 2
            return (
              <path
                key={`spoke-${gear.id}-${spokeIndex}`}
                d={createArmPath(
                  gear.center,
                  hubRadius,
                  rimInnerRadius,
                  spokeCenterAngle,
                  armWidth,
                )}
                fill={fill}
                pointerEvents="none"
                stroke={stroke}
                strokeLinejoin="round"
                strokeWidth={1.4}
              />
            )
          })}
          <path
            d={hubRingPath}
            fill={fill}
            fillRule="evenodd"
            pointerEvents="none"
            stroke={stroke}
            strokeLinejoin="round"
            strokeWidth={1.5}
          />
        </>
      ) : (
        <>
          <path
            d={gearOutlinePath}
            fill={fill}
            pointerEvents="none"
            stroke={stroke}
            strokeLinejoin="round"
            strokeWidth={2}
          />
          <circle
            cx={gear.center.x}
            cy={gear.center.y}
            r={GEAR_BORE_RADIUS}
            fill="transparent"
            pointerEvents="none"
            stroke={stroke}
            strokeWidth={1.5}
          />
        </>
      )}
      <path
        d={gearHitPath}
        data-testid={isDraft ? undefined : `gear-hit-${gear.id}`}
        fill="rgba(0, 0, 0, 0.001)"
        fillRule="evenodd"
        pointerEvents={pointerEvents}
        stroke="none"
      />
      {isSelected ? (
        <circle
          cx={gear.center.x}
          cy={gear.center.y}
          r={outerRadius + 6}
          fill="none"
          pointerEvents="none"
          stroke="rgba(31, 33, 34, 0.55)"
          strokeDasharray="6 6"
          strokeWidth={1.5}
        />
      ) : null}
    </g>
  )
}

export function ClockworkEditor() {
  const {
    activeMode,
    workspaces,
    setToothInput,
    switchMode,
    toggleLayer,
    addLayer,
    startPlacement,
    updateDraftCenter,
    commitDraft,
    cancelDraft,
    startMoveGear,
    deleteSelection,
    selectGear,
    togglePlay,
    setPlaybackMs,
    panBy,
    openInspector,
    openPlanetDialog,
    closePlanetDialog,
    closeOverlays,
    setNotice,
    importProject,
  } = useEditorStore()

  const workspace = workspaces[activeMode]
  const {
    layers,
    gears,
    activeLayerId,
    selectedGearId,
    draftGear,
    toothInput,
    isPlaying,
    playbackMs,
    baseAngles,
    camera,
    notice,
    inspector,
    planetDialog,
  } = workspace
  const modeConfig = getModeConfig(activeMode)

  const [isPanning, setIsPanning] = useState(false)
  const [optionalLayerVisibilityByMode, setOptionalLayerVisibilityByMode] = useState(
    DEFAULT_OPTIONAL_LAYER_VISIBILITY,
  )
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dialMaskId = useId().replace(/:/g, '-')
  const orreryArmMaskId = useId().replace(/:/g, '-')
  const fileInputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastPointerWorldRef = useRef<Point>(getDefaultPlacementPoint())
  const panInteractionRef = useRef<{
    pointerId: number
    client: Point
    didDrag: boolean
    clearsSelectionOnTap: boolean
  } | null>(null)
  const placementInteractionRef = useRef<{
    pointerId: number
    startedFromButton: boolean
    touchedCanvas: boolean
  } | null>(null)
  const gearInteractionRef = useRef<{
    pointerId: number
    gearId: string
    client: Point
    didDrag: boolean
  } | null>(null)
  const placementResultRef = useRef<PlacementResult | null>(null)
  const draftGearRef = useRef(draftGear)

  const sortedLayers = [...layers].sort((layerA, layerB) => layerA.order - layerB.order)
  const visibleLayers =
    activeMode === 'clock' || activeMode === 'orrery'
      ? layers.filter(
          (layer) =>
            getOptionalLayerVisibility(optionalLayerVisibilityByMode, activeMode, layer.id),
        )
      : layers
  const visibleLayerIds = visibleLayers.map((layer) => layer.id)
  const visibleLayerIdSet = new Set(visibleLayerIds)
  const visibleOutputs =
    modeConfig.outputs.filter((output) =>
      visibleLayers.some((layer) => layer.order === output.layerOrder),
    )
  const visibleOutputIds = visibleOutputs.map((output) => output.id)
  const visibleOutputIdSet = new Set(visibleOutputIds)
  const visibleOutputsByLayerOrder = new Map(
    visibleOutputs.map((output) => [output.layerOrder, output] as const),
  )
  const visibleGears =
    activeMode === 'orrery'
      ? gears.filter((gear) => visibleLayerIdSet.has(gear.layerId))
      : gears
  const activeLayerOrder =
    activeLayerId && visibleLayerIdSet.has(activeLayerId)
      ? getLayerById(visibleLayers, activeLayerId)?.order ?? null
      : null
  const visibleSortedLayers = sortedLayers.filter((layer) => visibleLayerIdSet.has(layer.id))

  useEffect(() => {
    if (activeMode !== 'orrery') {
      return
    }

    if (activeLayerId && !visibleLayerIds.includes(activeLayerId)) {
      toggleLayer(activeLayerId)
    }
  }, [activeLayerId, activeMode, toggleLayer, visibleLayerIds])

  useEffect(() => {
    if (activeMode !== 'orrery' || !planetDialog) {
      return
    }

    if (!visibleOutputIds.includes(planetDialog.outputId as Exclude<AnchorId, 'motor'>)) {
      closePlanetDialog()
    }
  }, [activeMode, closePlanetDialog, planetDialog, visibleOutputIds])

  const placementResult =
    draftGear === null || !visibleLayerIdSet.has(draftGear.layerId)
      ? null
      : resolvePlacement({
          mode: activeMode,
          draftGear,
          gears: visibleGears,
          layers: visibleLayers,
          excludeGearId: draftGear.gearId,
        })
  const analysis = analyzeClockwork(activeMode, visibleGears, visibleLayers, visibleOutputs)
  const parsedTeeth = parseTeethInput(toothInput)
  const canCreateGear = activeLayerId !== null && visibleLayerIdSet.has(activeLayerId) && parsedTeeth !== null
  const inspectorGear =
    inspector ? visibleGears.find((gear) => gear.id === inspector.gearId) ?? null : null
  const planetDialogOutput =
    activeMode === 'orrery' &&
    planetDialog &&
    visibleOutputIdSet.has(planetDialog.outputId as Exclude<AnchorId, 'motor'>)
      ? getOutputById(activeMode, planetDialog.outputId as Exclude<AnchorId, 'motor'>)
      : null

  placementResultRef.current = placementResult
  draftGearRef.current = draftGear

  const commitPlacementIfValid = useEffectEvent(() => {
    if (!draftGearRef.current || !placementResultRef.current) {
      return
    }

    if (isInvalidPlacementState(placementResultRef.current.state)) {
      if (draftGearRef.current.mode === 'moving') {
        cancelDraft()
      }
      return
    }

    commitDraft(placementResultRef.current.center)
  })

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (draftGearRef.current?.mode === 'moving') {
        cancelDraft()
      } else if (planetDialog) {
        closePlanetDialog()
      } else {
        closeOverlays()
      }
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!draftGearRef.current) {
        deleteSelection()
      }
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event)

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!planetDialog) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null

      if (
        target?.closest('[data-planet-dialog="true"]') ||
        target?.closest('[data-planet-hotspot="true"]')
      ) {
        return
      }

      closePlanetDialog()
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [planetDialog, closePlanetDialog])

  const handlePointerMove = useEffectEvent((event: PointerEvent) => {
    const svgElement = svgRef.current
    if (!svgElement) {
      return
    }

    if (panInteractionRef.current && panInteractionRef.current.pointerId === event.pointerId) {
      const panInteraction = panInteractionRef.current
      const clientDeltaX = event.clientX - panInteraction.client.x
      const clientDeltaY = event.clientY - panInteraction.client.y

      if (!panInteraction.didDrag) {
        const movement = Math.hypot(
          event.clientX - panInteraction.client.x,
          event.clientY - panInteraction.client.y,
        )

        if (movement < GEAR_DRAG_THRESHOLD_PX) {
          return
        }

        panInteractionRef.current = {
          ...panInteraction,
          didDrag: true,
        }
        setIsPanning(true)
      }

      const delta = createWorldDeltaFromClient(svgElement, clientDeltaX, clientDeltaY)

      panInteractionRef.current = {
        ...panInteractionRef.current,
        client: { x: event.clientX, y: event.clientY },
      }
      panBy(delta)
      return
    }

    const worldPoint = createWorldPointFromClient(svgElement, event.clientX, event.clientY, camera)
    const isInsideCanvas = isClientInsideElement(svgElement, event.clientX, event.clientY)

    const gearInteraction = gearInteractionRef.current
    if (gearInteraction?.pointerId === event.pointerId && draftGearRef.current?.mode === 'moving') {
      if (!worldPoint) {
        return
      }

      lastPointerWorldRef.current = worldPoint

      if (!gearInteraction.didDrag) {
        const movement = Math.hypot(
          event.clientX - gearInteraction.client.x,
          event.clientY - gearInteraction.client.y,
        )

        if (movement < GEAR_DRAG_THRESHOLD_PX) {
          return
        }

        gearInteractionRef.current = {
          ...gearInteraction,
          didDrag: true,
        }
      }

      updateDraftCenter(worldPoint)
      return
    }

    if (
      placementInteractionRef.current?.pointerId === event.pointerId &&
      draftGearRef.current?.mode === 'placing'
    ) {
      if (!isInsideCanvas || !worldPoint) {
        return
      }

      placementInteractionRef.current = {
        ...placementInteractionRef.current,
        touchedCanvas: true,
      }
      lastPointerWorldRef.current = worldPoint
      updateDraftCenter(worldPoint)
      return
    }

    if (!worldPoint) {
      return
    }

    lastPointerWorldRef.current = worldPoint
  })

  const handlePointerUp = useEffectEvent((event: PointerEvent) => {
    if (panInteractionRef.current?.pointerId === event.pointerId) {
      const panInteraction = panInteractionRef.current
      panInteractionRef.current = null
      setIsPanning(false)

      if (panInteraction.clearsSelectionOnTap && !panInteraction.didDrag && !draftGearRef.current) {
        selectGear(null)
      }
    }

    const gearInteraction = gearInteractionRef.current
    if (gearInteraction?.pointerId === event.pointerId) {
      gearInteractionRef.current = null
      const svgElement = svgRef.current
      const releasedOnCanvas =
        svgElement !== null && isClientInsideElement(svgElement, event.clientX, event.clientY)

      if (gearInteraction.didDrag) {
        if (!releasedOnCanvas) {
          deleteSelection()
          return
        }

        commitPlacementIfValid()
        return
      }

      cancelDraft()
      openInspector(gearInteraction.gearId, event.clientX, event.clientY)
    }

    if (placementInteractionRef.current?.pointerId === event.pointerId) {
      const placementInteraction = placementInteractionRef.current
      placementInteractionRef.current = null

      const svgElement = svgRef.current
      const releasedOnCanvas =
        svgElement !== null && isClientInsideElement(svgElement, event.clientX, event.clientY)

      if (
        releasedOnCanvas &&
        placementResultRef.current &&
        !isInvalidPlacementState(placementResultRef.current.state)
      ) {
        commitDraft(placementResultRef.current.center)
        return
      }

      if (placementInteraction.startedFromButton && !placementInteraction.touchedCanvas) {
        return
      }

      cancelDraft()
    }
  })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => handlePointerMove(event)
    const onPointerUp = (event: PointerEvent) => handlePointerUp(event)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  const updatePlayback = useEffectEvent((nextPlaybackMs: number) => {
    setPlaybackMs(nextPlaybackMs)
  })

  useEffect(() => {
    if (!isPlaying) {
      return
    }

    let frameId = 0
    const startAt = performance.now() - playbackMs

    const tick = (timestamp: number) => {
      updatePlayback(timestamp - startAt)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [isPlaying, playbackMs])

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const project = parseProjectJson(await file.text())
      startTransition(() => {
        importProject(project)
      })
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : 'Unable to import project.',
        variant: 'error',
      })
    } finally {
      event.target.value = ''
    }
  }

  function handleExport() {
    const project = buildProjectSnapshot(activeMode, {
      clock: {
        layers: workspaces.clock.layers,
        gears: workspaces.clock.gears,
        camera: workspaces.clock.camera,
      },
      orrery: {
        layers: workspaces.orrery.layers,
        gears: workspaces.orrery.gears,
        camera: workspaces.orrery.camera,
      },
    })
    const blob = new Blob([serializeProject(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'atelier-project.json'
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice({ message: 'Project exported.', variant: 'success' })
  }

  function handleCreateGearPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !canCreateGear) {
      return
    }

    if (draftGear?.mode === 'placing') {
      placementInteractionRef.current = null
      cancelDraft()
      return
    }

    if (draftGear !== null) {
      return
    }

    event.preventDefault()
    closeOverlays()
    startPlacement(lastPointerWorldRef.current ?? getDefaultPlacementPoint())
    placementInteractionRef.current = {
      pointerId: event.pointerId,
      startedFromButton: true,
      touchedCanvas: false,
    }
  }

  function handleStagePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const worldPoint = createWorldPointFromClient(event.currentTarget, event.clientX, event.clientY, camera)
    if (!worldPoint) {
      return
    }

    lastPointerWorldRef.current = worldPoint
  }

  function handleStagePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    closeOverlays()

    const worldPoint = createWorldPointFromClient(
      event.currentTarget,
      event.clientX,
      event.clientY,
      camera,
    )

    if (event.button === 2) {
      event.preventDefault()
      panInteractionRef.current = {
        pointerId: event.pointerId,
        client: { x: event.clientX, y: event.clientY },
        didDrag: true,
        clearsSelectionOnTap: false,
      }
      setIsPanning(true)
      return
    }

    if (event.button !== 0) {
      return
    }

    event.preventDefault()

    if (draftGear?.mode === 'placing') {
      if (!worldPoint) {
        return
      }

      placementInteractionRef.current = {
        pointerId: event.pointerId,
        startedFromButton: false,
        touchedCanvas: true,
      }
      lastPointerWorldRef.current = worldPoint
      updateDraftCenter(worldPoint)
      return
    }

    panInteractionRef.current = {
      pointerId: event.pointerId,
      client: { x: event.clientX, y: event.clientY },
      didDrag: false,
      clearsSelectionOnTap: true,
    }
  }

  function handleGearPointerDown(event: ReactPointerEvent<SVGGElement>, gear: Gear) {
    if (event.button !== 0 || draftGear?.mode === 'placing') {
      return
    }

    const worldPoint = createWorldPointFromClient(
      svgRef.current ?? event.currentTarget.ownerSVGElement!,
      event.clientX,
      event.clientY,
      camera,
    )

    if (!worldPoint) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    startMoveGear(gear.id, worldPoint)
    gearInteractionRef.current = {
      pointerId: event.pointerId,
      gearId: gear.id,
      client: { x: event.clientX, y: event.clientY },
      didDrag: false,
    }
  }

  function handlePlanetPointerDown(event: ReactPointerEvent<SVGGElement>) {
    event.stopPropagation()

    if (event.button === 2) {
      event.preventDefault()
    }
  }

  function handlePlanetClick(
    event: ReactClickEvent<SVGGElement>,
    output: OutputTarget,
  ) {
    event.stopPropagation()
    openPlanetDialog(output.id, event.clientX, event.clientY)
  }

  function handlePlanetContextMenu(event: ReactMouseEvent<SVGGElement>) {
    event.preventDefault()
    event.stopPropagation()
  }

  function handleOptionalLayerToggle(layer: Layer, checked: boolean) {
    if (!isOptionalLayer(activeMode, layer.id)) {
      return
    }

    setOptionalLayerVisibilityByMode((current) => ({
      ...current,
      [activeMode]: {
        ...current[activeMode],
        [layer.id]: checked,
      },
    }))

    if (checked) {
      return
    }

    if (draftGear?.layerId === layer.id) {
      cancelDraft()
    }

    if (activeLayerId === layer.id) {
      toggleLayer(layer.id)
    }

    const output = getOutputForLayer(activeMode, layer.order)
    if (activeMode === 'orrery' && planetDialog && output && planetDialog.outputId === output.id) {
      closePlanetDialog()
    }
  }

  function getGearHighlightState(gearId: string) {
    if (!draftGear || !placementResult) {
      return null
    }

    return placementResult.highlightedGearIds.includes(gearId) ? placementResult.state : null
  }

  function getAnchorHighlightState(anchor: AnchorId) {
    if (!draftGear || !placementResult) {
      return null
    }

    return placementResult.highlightedAnchors.includes(anchor) ? placementResult.state : null
  }

  function renderArbor(output: OutputTarget, layerOrder: number) {
    const highlight = getAnchorHighlightState(output.id)
    const strokeStyle = highlight
      ? { opacity: 1, stroke: getHighlightColor(highlight) }
      : getLayerStrokeStyle(layerOrder, activeLayerOrder)

    return (
      <circle
        key={output.id}
        cx={output.center.x}
        cy={output.center.y}
        r={output.arborRadius}
        data-testid={`arbor-${output.id}`}
        fill="none"
        opacity={strokeStyle.opacity}
        pointerEvents="none"
        stroke={strokeStyle.stroke}
        strokeWidth={2}
      />
    )
  }

  function renderClockHand({
    output,
    handLength,
    tailLength = 0,
    strokeWidth,
    testId,
  }: {
    output: OutputTarget
    handLength: number
    tailLength?: number
    strokeWidth: number
    testId: string
  }) {
    return (
      <line
        data-testid={testId}
        x1={output.center.x}
        y1={output.center.y + tailLength}
        x2={output.center.x}
        y2={output.center.y - handLength}
        stroke="var(--ink)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        transform={`rotate(${getAnimatedAngle(baseAngles[output.id] ?? 0, analysis.outputStates[output.id]?.rpm ?? null, playbackMs, isPlaying)} ${output.center.x} ${output.center.y})`}
      />
    )
  }

  function renderAmPmDial(output: OutputTarget) {
    const radius = CLOCK_COMPLICATION_DIAL_RADIUS
    const sunY = output.center.y - radius * 0.42
    const moonY = output.center.y + radius * 0.42

    return (
      <g data-testid="am-pm-dial">
        <circle
          cx={output.center.x}
          cy={output.center.y}
          r={radius}
          fill="var(--paper)"
          stroke="var(--dial-strong)"
          strokeWidth={2.2}
        />
        <circle
          cx={output.center.x}
          cy={output.center.y}
          r={radius * 0.76}
          fill="none"
          stroke="var(--dial-medium)"
          strokeWidth={1.2}
        />
        <line
          x1={output.center.x - radius * 0.76}
          y1={output.center.y}
          x2={output.center.x + radius * 0.76}
          y2={output.center.y}
          stroke="var(--dial-medium)"
          strokeWidth={1.5}
        />
        <circle
          cx={output.center.x}
          cy={sunY}
          r={radius * 0.12}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.2}
        />
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (Math.PI * 2 * index) / 8
          const innerPoint = getPointOnCircle(
            { x: output.center.x, y: sunY },
            radius * 0.17,
            angle,
          )
          const outerPoint = getPointOnCircle(
            { x: output.center.x, y: sunY },
            radius * 0.25,
            angle,
          )
          return (
            <line
              key={`am-pm-ray-${index}`}
              x1={innerPoint.x}
              y1={innerPoint.y}
              x2={outerPoint.x}
              y2={outerPoint.y}
              stroke="var(--ink)"
              strokeWidth={1}
            />
          )
        })}
        <circle
          cx={output.center.x}
          cy={moonY}
          r={radius * 0.15}
          fill="var(--ink)"
        />
        <circle
          cx={output.center.x + radius * 0.06}
          cy={moonY - radius * 0.03}
          r={radius * 0.14}
          fill="var(--paper)"
        />
      </g>
    )
  }

  function renderDayDial(output: OutputTarget) {
    const radius = CLOCK_COMPLICATION_DIAL_RADIUS

    return (
      <g data-testid="day-dial">
        <circle
          cx={output.center.x}
          cy={output.center.y}
          r={radius}
          fill="var(--paper)"
          stroke="var(--dial-strong)"
          strokeWidth={2.2}
        />
        <circle
          cx={output.center.x}
          cy={output.center.y}
          r={CLOCK_DAY_INNER_RING_RADIUS}
          fill="none"
          stroke="var(--dial-medium)"
          strokeWidth={1.2}
        />
        {Array.from({ length: WEEKDAY_NAMES.length }, (_, index) => {
          const angle = (Math.PI * 2 * (index + 0.5)) / WEEKDAY_NAMES.length - Math.PI / 2
          const innerPoint = getPointOnCircle(output.center, CLOCK_DAY_INNER_RING_RADIUS + 4, angle)
          const outerPoint = getPointOnCircle(output.center, radius - 8, angle)
          return (
            <line
              key={`day-separator-${index}`}
              x1={innerPoint.x}
              y1={innerPoint.y}
              x2={outerPoint.x}
              y2={outerPoint.y}
              stroke="var(--dial-medium)"
              strokeWidth={1}
            />
          )
        })}
        {WEEKDAY_NAMES.map((dayName, index) => {
          const angle = (Math.PI * 2 * index) / WEEKDAY_NAMES.length - Math.PI / 2
          const point = getPointOnCircle(output.center, CLOCK_DAY_LABEL_RADIUS, angle)
          const rotation = (angle * 180) / Math.PI + 90
          return (
            <text
              key={`day-label-${dayName}`}
              x={point.x}
              y={point.y}
              dominantBaseline="middle"
              fill="var(--ink)"
              fontFamily="'Times New Roman', Times, serif"
              fontSize={11}
              letterSpacing="0.01em"
              textAnchor="middle"
              transform={`rotate(${rotation} ${point.x} ${point.y})`}
            >
              {dayName}
            </text>
          )
        })}
      </g>
    )
  }

  const dialOpacity = activeLayerOrder === null ? 0.985 : 0.18
  const showOrreryOverlay = activeLayerOrder === null
  const orreryArmOpacity = showOrreryOverlay ? 1 : 0.18
  const orreryPlanetOpacity = showOrreryOverlay ? 1 : 0.2
  const numeralRadius =
    DIAL_INNER_RADIUS + (DIAL_MIDDLE_RADIUS - DIAL_INNER_RADIUS) * 0.43
  const visibleClockOutputsById = new Map(
    visibleOutputs.map((output) => [output.id, output] as const),
  )

  const orreryVisuals =
    activeMode === 'orrery'
      ? visibleOutputs.map((output) => {
          const angleDegrees = getAnimatedAngle(
            baseAngles[output.id] ?? 0,
            analysis.outputStates[output.id]?.rpm ?? null,
            playbackMs,
            isPlaying,
          )
          const point = getPointOnOrbit(output.orbitRadius ?? 0, angleDegrees)
          const size = PLANET_SIZES[output.assetId ?? 'earth'] ?? 76

          return {
            output,
            angleDegrees,
            point,
            size,
          }
        })
      : []

  return (
    <div className="app-shell" data-mode={modeConfig.theme}>
      <section className="workspace-panel">
        <div className="workspace-frame">
          {analysis.status ? (
            <div
              className="workspace-badge"
              data-kind={analysis.status.kind}
              data-testid="clock-status"
            >
              {analysis.status.label}
            </div>
          ) : null}

          {inspector && inspectorGear ? (
            <div
              className="inspector"
              data-testid="gear-inspector"
              style={getSafeWindowPosition(inspector.screenX, inspector.screenY, 250, 140)}
            >
              <h3>Gear {inspectorGear.id}</h3>
              <p>Teeth: {inspectorGear.teeth}</p>
              <p>
                {analysis.computedByGearId[inspectorGear.id]?.conflicts
                  ? 'Rate unavailable (conflicting train).'
                  : analysis.computedByGearId[inspectorGear.id]?.rpm !== null
                    ? `Rate: ${formatRpmFraction(analysis.computedByGearId[inspectorGear.id].rpm ?? 0)}`
                    : 'Rate: not driven by the motor.'}
              </p>
            </div>
          ) : null}

          {planetDialog && planetDialogOutput ? (
            <div
              aria-label={`${planetDialogOutput.label} target period`}
              className="planet-dialog"
              data-planet-dialog="true"
              data-testid="planet-dialog"
              role="dialog"
              style={getSafeWindowPosition(planetDialog.screenX, planetDialog.screenY, 260, 150)}
            >
              <h3>{planetDialogOutput.label}</h3>
              <p>
                Target rate: {formatRpmFraction(planetDialogOutput.targetRpm)}
              </p>
            </div>
          ) : null}

          <svg
            ref={svgRef}
            className="workspace-svg"
            data-panning={isPanning}
            data-testid="workspace-svg"
            viewBox={getViewBox(camera)}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
          >
            <defs>
              <pattern
                id="schematic-grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="var(--grid-line)"
                  strokeWidth="1"
                />
              </pattern>
              <mask
                id={dialMaskId}
                maskUnits="userSpaceOnUse"
                x={WORKSPACE_CENTER.x - DIAL_OUTER_RADIUS}
                y={WORKSPACE_CENTER.y - DIAL_OUTER_RADIUS}
                width={DIAL_OUTER_RADIUS * 2}
                height={DIAL_OUTER_RADIUS * 2}
              >
                <circle
                  cx={WORKSPACE_CENTER.x}
                  cy={WORKSPACE_CENTER.y}
                  r={DIAL_OUTER_RADIUS}
                  fill="white"
                />
                <circle
                  cx={WORKSPACE_CENTER.x}
                  cy={WORKSPACE_CENTER.y}
                  r={DIAL_INNER_RADIUS}
                  fill="black"
                />
              </mask>
              <mask
                id={orreryArmMaskId}
                maskUnits="userSpaceOnUse"
                x={camera.panX - WORLD_WIDTH / 2}
                y={camera.panY - WORLD_HEIGHT / 2}
                width={WORLD_WIDTH}
                height={WORLD_HEIGHT}
              >
                <rect
                  x={camera.panX - WORLD_WIDTH / 2}
                  y={camera.panY - WORLD_HEIGHT / 2}
                  width={WORLD_WIDTH}
                  height={WORLD_HEIGHT}
                  fill="white"
                />
                {activeMode === 'orrery'
                  ? orreryVisuals.map(({ output, point, size }) =>
                      renderPlanetOccluder(output, point, size, 'black'),
                    )
                  : null}
              </mask>
            </defs>

            <rect
              x={camera.panX - WORLD_WIDTH / 2}
              y={camera.panY - WORLD_HEIGHT / 2}
              width={WORLD_WIDTH}
              height={WORLD_HEIGHT}
              fill="url(#schematic-grid)"
            />

            <g pointerEvents="none">
              <rect
                x={MOTOR_CENTER.x - 24}
                y={MOTOR_CENTER.y - 24}
                width={48}
                height={48}
                rx={9}
                ry={9}
                fill="transparent"
                stroke={
                  getAnchorHighlightState('motor')
                    ? getHighlightColor(getAnchorHighlightState('motor')!)
                    : 'var(--ink)'
                }
                strokeWidth={2}
              />
              <circle
                cx={MOTOR_CENTER.x}
                cy={MOTOR_CENTER.y}
                r={MOTOR_AXLE_RADIUS}
                fill="var(--paper)"
                stroke={
                  getAnchorHighlightState('motor')
                    ? getHighlightColor(getAnchorHighlightState('motor')!)
                    : 'var(--ink)'
                }
                strokeWidth={2}
              />
            </g>

            {visibleSortedLayers.map((layer) => {
              const output = visibleOutputsByLayerOrder.get(layer.order) ?? null
              return (
                <g key={layer.id} data-testid={`layer-group-${layer.order}`}>
                  {visibleGears
                    .filter(
                      (gear) =>
                        gear.layerId === layer.id &&
                        !(draftGear?.mode === 'moving' && draftGear.gearId === gear.id),
                    )
                    .map((gear) => (
                      <GearGlyph
                        key={gear.id}
                        gear={gear}
                        layer={layer}
                        activeLayerOrder={activeLayerOrder}
                        computedState={analysis.computedByGearId[gear.id] ?? null}
                        playbackMs={playbackMs}
                        isPlaying={isPlaying}
                        isSelected={selectedGearId === gear.id}
                        isDraft={false}
                        highlightState={getGearHighlightState(gear.id)}
                        onPointerDown={
                          gear.layerId === activeLayerId ? (event) => handleGearPointerDown(event, gear) : undefined
                        }
                        pointerEvents={
                          draftGear?.mode === 'placing'
                            ? 'none'
                            : gear.layerId === activeLayerId
                              ? 'auto'
                              : 'none'
                        }
                      />
                    ))}

                  {draftGear && draftGear.layerId === layer.id ? (
                    <GearGlyph
                      gear={{
                        id: draftGear.gearId ?? 'draft',
                        teeth: draftGear.teeth,
                        layerId: draftGear.layerId,
                        center: placementResult?.center ?? draftGear.center,
                      }}
                      layer={layer}
                      activeLayerOrder={activeLayerOrder}
                      computedState={null}
                      playbackMs={0}
                      isPlaying={false}
                      isSelected={false}
                      isDraft={true}
                      highlightState={placementResult?.state ?? 'free'}
                      pointerEvents="none"
                    />
                  ) : null}

                  {output ? renderArbor(output, layer.order) : null}
                </g>
              )
            })}

            {activeMode === 'clock' ? (
              <>
                <g opacity={dialOpacity} pointerEvents="none">
                  <circle
                    cx={WORKSPACE_CENTER.x}
                    cy={WORKSPACE_CENTER.y}
                    r={DIAL_OUTER_RADIUS}
                    data-testid="dial-ring-fill"
                    fill="var(--paper)"
                    mask={`url(#${dialMaskId})`}
                  />
                  <circle
                    cx={WORKSPACE_CENTER.x}
                    cy={WORKSPACE_CENTER.y}
                    r={DIAL_OUTER_RADIUS}
                    fill="none"
                    stroke="var(--dial-strong)"
                    strokeWidth={3}
                  />
                  <circle
                    cx={WORKSPACE_CENTER.x}
                    cy={WORKSPACE_CENTER.y}
                    r={DIAL_MIDDLE_RADIUS}
                    fill="none"
                    stroke="var(--dial-medium)"
                    strokeWidth={2.25}
                  />
                  <circle
                    cx={WORKSPACE_CENTER.x}
                    cy={WORKSPACE_CENTER.y}
                    r={DIAL_INNER_RADIUS}
                    fill="none"
                    stroke="var(--dial-strong)"
                    strokeWidth={2.25}
                  />
                  {Array.from({ length: 60 }, (_, index) => {
                    const angle = (Math.PI * 2 * index) / 60 - Math.PI / 2
                    const x1 = Math.cos(angle) * DIAL_MIDDLE_RADIUS
                    const y1 = Math.sin(angle) * DIAL_MIDDLE_RADIUS
                    const x2 = Math.cos(angle) * DIAL_OUTER_RADIUS
                    const y2 = Math.sin(angle) * DIAL_OUTER_RADIUS
                    return (
                      <line
                        key={`dial-minute-${index}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={index % 5 === 0 ? 'var(--dial-medium)' : 'var(--dial-faint)'}
                        strokeWidth={index % 5 === 0 ? 1.7 : 1}
                      />
                    )
                  })}
                  {ROMAN_NUMERALS.map((numeral, index) => {
                    const angle = (Math.PI * 2 * index) / 12 - Math.PI / 2
                    const x = Math.cos(angle) * numeralRadius
                    const y = Math.sin(angle) * numeralRadius
                    const rotation = (angle * 180) / Math.PI + 90
                    return (
                      <text
                        key={`dial-numeral-${numeral}`}
                        data-testid={`dial-numeral-${numeral}`}
                        x={x}
                        y={y}
                        dominantBaseline="middle"
                        fill="var(--ink)"
                        fontFamily="'Iowan Old Style', 'Palatino Linotype', Georgia, serif"
                        fontSize={50}
                        fontWeight={400}
                        letterSpacing="0.02em"
                        textAnchor="middle"
                        transform={`rotate(${rotation} ${x} ${y})`}
                      >
                        {numeral}
                      </text>
                    )
                  })}
                  {visibleClockOutputsById.has('amPmArbor')
                    ? renderAmPmDial(visibleClockOutputsById.get('amPmArbor')!)
                    : null}
                  {visibleClockOutputsById.has('dayArbor')
                    ? renderDayDial(visibleClockOutputsById.get('dayArbor')!)
                    : null}
                </g>

                <g opacity={dialOpacity} pointerEvents="none">
                  {visibleClockOutputsById.has('hourArbor')
                    ? renderClockHand({
                        output: visibleClockOutputsById.get('hourArbor')!,
                        handLength: 140,
                        strokeWidth: 8,
                        testId: 'hour-hand',
                      })
                    : null}
                  {visibleClockOutputsById.has('minuteArbor')
                    ? renderClockHand({
                        output: visibleClockOutputsById.get('minuteArbor')!,
                        handLength: 215,
                        strokeWidth: 5.5,
                        testId: 'minute-hand',
                      })
                    : null}
                  {visibleClockOutputsById.has('secondArbor')
                    ? renderClockHand({
                        output: visibleClockOutputsById.get('secondArbor')!,
                        handLength: 280,
                        tailLength: 28,
                        strokeWidth: 3,
                        testId: 'second-hand',
                      })
                    : null}
                  {visibleClockOutputsById.has('amPmArbor')
                    ? renderClockHand({
                        output: visibleClockOutputsById.get('amPmArbor')!,
                        handLength: CLOCK_AM_PM_HAND_LENGTH,
                        strokeWidth: 4,
                        testId: 'am-pm-hand',
                      })
                    : null}
                  {visibleClockOutputsById.has('dayArbor')
                    ? renderClockHand({
                        output: visibleClockOutputsById.get('dayArbor')!,
                        handLength: CLOCK_DAY_HAND_LENGTH,
                        strokeWidth: 4,
                        testId: 'day-hand',
                      })
                    : null}
                  {Array.from(visibleClockOutputsById.values()).map((output) => (
                    <circle
                      key={`clock-hand-cap-${output.id}`}
                      cx={output.center.x}
                      cy={output.center.y}
                      r={output.id === 'secondArbor' ? 5 : 4}
                      fill="var(--ink)"
                    />
                  ))}
                </g>
              </>
            ) : (
              <g className="orrery-scene" data-testid="orrery-overlay">
                {showOrreryOverlay ? (
                  <g
                    className="orrery-arm-occluders"
                    mask={`url(#${orreryArmMaskId})`}
                    pointerEvents="none"
                  >
                    {orreryVisuals.map(({ output, angleDegrees, size }) => {
                      const angle = ((angleDegrees - 90) * Math.PI) / 180
                      const outerRadius = Math.max(
                        output.arborRadius + 14,
                        (output.orbitRadius ?? 0) - size * 0.18,
                      )
                      return (
                        <path
                          key={`arm-occluder-${output.id}`}
                          d={createArmPath(
                            WORKSPACE_CENTER,
                            output.arborRadius,
                            outerRadius,
                            angle,
                            Math.max(4.5, 9 - output.layerOrder * 0.6),
                          )}
                          fill="var(--orrery-arm-occluder)"
                        />
                      )
                    })}
                  </g>
                ) : null}

                <g
                  className="orrery-arms"
                  mask={`url(#${orreryArmMaskId})`}
                  opacity={orreryArmOpacity}
                  pointerEvents="none"
                >
                  {orreryVisuals.map(({ output, angleDegrees, size }) => {
                    const angle = ((angleDegrees - 90) * Math.PI) / 180
                    const outerRadius = Math.max(
                      output.arborRadius + 14,
                      (output.orbitRadius ?? 0) - size * 0.18,
                    )
                    return (
                      <path
                        key={`arm-${output.id}`}
                        d={createArmPath(
                          WORKSPACE_CENTER,
                          output.arborRadius,
                          outerRadius,
                          angle,
                          Math.max(4.5, 9 - output.layerOrder * 0.6),
                        )}
                        fill="var(--orrery-arm-fill)"
                        stroke="var(--orrery-arm-stroke)"
                        strokeWidth={1.5}
                      />
                    )
                  })}
                </g>

                {showOrreryOverlay ? (
                  <g className="orrery-planet-occluders" pointerEvents="none">
                    {orreryVisuals.map(({ output, point, size }) =>
                      renderPlanetOccluder(output, point, size, 'var(--orrery-planet-occluder)'),
                    )}
                  </g>
                ) : null}

                <g
                  className="orrery-planets"
                  opacity={orreryPlanetOpacity}
                  pointerEvents={showOrreryOverlay ? 'auto' : 'none'}
                >
                  {orreryVisuals.map(({ output, point, size }) => {
                    const assetId = (output.assetId ?? 'earth') as keyof typeof PLANET_ASSETS
                    const href = PLANET_ASSETS[assetId]

                    return (
                      <g
                        key={output.id}
                        data-planet-hotspot={showOrreryOverlay ? 'true' : undefined}
                        data-testid={`planet-${output.id}`}
                        onClick={showOrreryOverlay ? (event) => handlePlanetClick(event, output) : undefined}
                        onContextMenu={showOrreryOverlay ? handlePlanetContextMenu : undefined}
                        onPointerDown={showOrreryOverlay ? handlePlanetPointerDown : undefined}
                      >
                        <image
                          href={href}
                          x={point.x - size / 2}
                          y={point.y - size / 2}
                          width={size}
                          height={size}
                          opacity={1}
                          preserveAspectRatio="xMidYMid meet"
                        />
                      </g>
                    )
                  })}
                </g>

                {showOrreryOverlay ? renderSunGlyph() : null}
              </g>
            )}
          </svg>
        </div>
      </section>

      <aside className="sidebar">
        <div className="panel title-panel">
          <button
            className="title-toggle"
            data-testid="mode-toggle"
            onClick={() => switchMode()}
            type="button"
          >
            <span>{modeConfig.title}</span>
            <small>Switch scene</small>
          </button>
        </div>

        <div className="panel">
          <button
            className="play-button"
            data-active={isPlaying}
            data-testid="play-button"
            onClick={() => togglePlay(new Date())}
            type="button"
          >
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
            <span aria-hidden="true">{isPlaying ? '❚❚' : '▶'}</span>
          </button>
        </div>

        <div className="panel">
          <h2>New Gear</h2>
          <div className="gear-row">
            <button
              className="gear-create-button"
              data-active={draftGear?.mode === 'placing'}
              data-testid="gear-create-button"
              disabled={!canCreateGear}
              onPointerDown={handleCreateGearPointerDown}
              type="button"
            >
              ⚙
            </button>
            <label>
              <span className="sr-only">Gear teeth</span>
              <input
                className="gear-input"
                data-testid="tooth-input"
                inputMode="numeric"
                max={MAX_TEETH}
                min={MIN_TEETH}
                onChange={(event) => setToothInput(event.target.value)}
                placeholder={`Teeth (${MIN_TEETH}-${MAX_TEETH})`}
                type="text"
                value={toothInput}
              />
            </label>
          </div>
        </div>

        <div className="panel">
          <h2>{modeConfig.layerSectionTitle}</h2>
          <div className="layer-list">
            {sortedLayers.map((layer) => {
              const layerEnabled =
                getOptionalLayerVisibility(optionalLayerVisibilityByMode, activeMode, layer.id)

              return (
                <div
                  key={layer.id}
                  className="layer-row"
                  data-optional={isOptionalLayer(activeMode, layer.id)}
                >
                  <button
                    className="layer-button"
                    data-active={activeLayerId === layer.id && layerEnabled}
                    data-disabled={!layerEnabled}
                    data-testid={`layer-button-${layer.order}`}
                    disabled={!layerEnabled}
                    onClick={() => toggleLayer(layer.id)}
                    type="button"
                  >
                    {layer.name}
                  </button>
                  {isOptionalLayer(activeMode, layer.id) ? (
                    <input
                      aria-label={`Enable ${layer.name}`}
                      checked={layerEnabled}
                      className="layer-checkbox"
                      data-testid={`layer-checkbox-${layer.order}`}
                      onChange={(event) => handleOptionalLayerToggle(layer, event.target.checked)}
                      type="checkbox"
                    />
                  ) : null}
                </div>
              )
            })}
            {modeConfig.allowAddLayer ? (
              <button
                className="layer-button"
                data-testid="new-layer-button"
                onClick={() => addLayer()}
                type="button"
              >
                New Layer
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <h2>Project</h2>
          <div className="sidebar-actions">
            <button className="sidebar-button" onClick={handleExport} type="button">
              Export JSON
            </button>
            <button
              className="sidebar-button"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              Import JSON
            </button>
          </div>
          <input
            ref={fileInputRef}
            accept="application/json"
            id={fileInputId}
            onChange={handleImportFileChange}
            style={{ display: 'none' }}
            type="file"
          />
          <div className="notice" data-variant={notice?.variant ?? 'neutral'}>
            {notice?.message ?? ''}
          </div>
        </div>
      </aside>
    </div>
  )
}
