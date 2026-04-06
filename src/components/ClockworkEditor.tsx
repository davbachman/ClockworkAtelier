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
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ARBOR_BY_LAYER_ORDER,
  ARBOR_RADII,
  CLOCK_CENTER,
  DIAL_INNER_RADIUS,
  DIAL_MIDDLE_RADIUS,
  DIAL_OUTER_RADIUS,
  GEAR_BORE_RADIUS,
  MAX_TEETH,
  MIN_TEETH,
  MOTOR_AXLE_RADIUS,
  MOTOR_CENTER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
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
import { getAnimatedHandAngle } from '../lib/hands'
import { buildProjectSnapshot, parseProjectJson, serializeProject } from '../lib/project'
import { analyzeClockwork } from '../lib/solver'
import { getDefaultPlacementPoint, useEditorStore } from '../store/editorStore'
import type {
  AnchorKind,
  ComputedGearState,
  Gear,
  Layer,
  PlacementResult,
  Point,
} from '../lib/types'

const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']
const GEAR_DRAG_THRESHOLD_PX = 4

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

function getAngleFromRpm(rpm: number | null, playbackMs: number, isPlaying: boolean) {
  if (!isPlaying || rpm === null) {
    return 0
  }

  return (rpm * 360 * playbackMs) / 60000
}

function getGearStyle(layer: Layer, activeLayerOrder: number | null) {
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
      fill: '#efe7d9',
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
  const angle = getAngleFromRpm(computedState?.rpm ?? null, playbackMs, isPlaying)

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
    layers,
    gears,
    activeLayerId,
    selectedGearId,
    draftGear,
    toothInput,
    isPlaying,
    playbackMs,
    handBaseAngles,
    camera,
    notice,
    inspector,
    setToothInput,
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
    closeInspector,
    setNotice,
    importProject,
  } = useEditorStore()

  const [isPanning, setIsPanning] = useState(false)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dialMaskId = useId().replace(/:/g, '-')
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

  const activeLayerOrder = activeLayerId
    ? getLayerById(layers, activeLayerId)?.order ?? null
    : null

  const placementResult =
    draftGear === null
      ? null
      : resolvePlacement({
          draftGear,
          gears,
          layers,
          excludeGearId: draftGear.gearId,
        })
  const analysis = analyzeClockwork(gears, layers)
  const parsedTeeth = parseTeethInput(toothInput)
  const canCreateGear = activeLayerId !== null && parsedTeeth !== null
  const inspectorGear = inspector ? gears.find((gear) => gear.id === inspector.gearId) ?? null : null

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
      } else {
        closeInspector()
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

      const delta = createWorldDeltaFromClient(
        svgElement,
        clientDeltaX,
        clientDeltaY,
      )

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
    const project = buildProjectSnapshot(layers, gears, camera)
    const blob = new Blob([serializeProject(project)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'clockwork-atelier-project.json'
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
    closeInspector()
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
    closeInspector()

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

  function getGearHighlightState(gearId: string) {
    if (!draftGear || !placementResult) {
      return null
    }

    return placementResult.highlightedGearIds.includes(gearId) ? placementResult.state : null
  }

  function getAnchorHighlightState(anchor: AnchorKind) {
    if (!draftGear || !placementResult) {
      return null
    }

    return placementResult.highlightedAnchors.includes(anchor) ? placementResult.state : null
  }

  const dialOpacity = activeLayerOrder === null ? 0.985 : 0.18
  const sortedLayers = [...layers].sort((layerA, layerB) => layerA.order - layerB.order)
  const numeralRadius =
    DIAL_INNER_RADIUS + (DIAL_MIDDLE_RADIUS - DIAL_INNER_RADIUS) * 0.43

  function renderArbor(anchor: Exclude<AnchorKind, 'motor'>, layerOrder: number) {
    const highlight = getAnchorHighlightState(anchor)
    const strokeStyle = highlight
      ? { opacity: 1, stroke: getHighlightColor(highlight) }
      : getLayerStrokeStyle(layerOrder, activeLayerOrder)

    return (
      <circle
        key={anchor}
        cx={CLOCK_CENTER.x}
        cy={CLOCK_CENTER.y}
        r={ARBOR_RADII[anchor]}
        data-testid={`arbor-${anchor}`}
        fill="none"
        opacity={strokeStyle.opacity}
        pointerEvents="none"
        stroke={strokeStyle.stroke}
        strokeWidth={2}
      />
    )
  }

  return (
    <div className="app-shell">
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
              style={{
                left: Math.min(inspector.screenX + 12, window.innerWidth - 250),
                top: Math.min(inspector.screenY + 12, window.innerHeight - 140),
              }}
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

          <svg
            ref={svgRef}
            className="workspace-svg"
            data-panning={isPanning}
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
                  stroke="rgba(31, 33, 34, 0.07)"
                  strokeWidth="1"
                />
              </pattern>
              <mask
                id={dialMaskId}
                maskUnits="userSpaceOnUse"
                x={CLOCK_CENTER.x - DIAL_OUTER_RADIUS}
                y={CLOCK_CENTER.y - DIAL_OUTER_RADIUS}
                width={DIAL_OUTER_RADIUS * 2}
                height={DIAL_OUTER_RADIUS * 2}
              >
                <circle
                  cx={CLOCK_CENTER.x}
                  cy={CLOCK_CENTER.y}
                  r={DIAL_OUTER_RADIUS}
                  fill="white"
                />
                <circle
                  cx={CLOCK_CENTER.x}
                  cy={CLOCK_CENTER.y}
                  r={DIAL_INNER_RADIUS}
                  fill="black"
                />
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
                stroke={getAnchorHighlightState('motor') ? getHighlightColor(getAnchorHighlightState('motor')!) : 'var(--ink)'}
                strokeWidth={2}
              />
              <circle
                cx={MOTOR_CENTER.x}
                cy={MOTOR_CENTER.y}
                r={MOTOR_AXLE_RADIUS}
                fill="var(--paper)"
                stroke={getAnchorHighlightState('motor') ? getHighlightColor(getAnchorHighlightState('motor')!) : 'var(--ink)'}
                strokeWidth={2}
              />
            </g>

            <g>{renderArbor('secondArbor', 1)}</g>

            {sortedLayers.map((layer) => (
              <g key={layer.id} data-testid={`layer-group-${layer.order}`}>
                {gears
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

                {layer.order >= 2 && layer.order <= 3
                  ? renderArbor(ARBOR_BY_LAYER_ORDER[layer.order], layer.order)
                  : null}
              </g>
            ))}

            <g opacity={dialOpacity} pointerEvents="none">
              <circle
                cx={CLOCK_CENTER.x}
                cy={CLOCK_CENTER.y}
                r={DIAL_OUTER_RADIUS}
                data-testid="dial-ring-fill"
                fill="var(--paper)"
                mask={`url(#${dialMaskId})`}
              />
              <circle
                cx={CLOCK_CENTER.x}
                cy={CLOCK_CENTER.y}
                r={DIAL_OUTER_RADIUS}
                fill="none"
                stroke="rgba(31, 33, 34, 0.68)"
                strokeWidth={3}
              />
              <circle
                cx={CLOCK_CENTER.x}
                cy={CLOCK_CENTER.y}
                r={DIAL_MIDDLE_RADIUS}
                fill="none"
                stroke="rgba(31, 33, 34, 0.58)"
                strokeWidth={2.25}
              />
              <circle
                cx={CLOCK_CENTER.x}
                cy={CLOCK_CENTER.y}
                r={DIAL_INNER_RADIUS}
                fill="none"
                stroke="rgba(31, 33, 34, 0.6)"
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
                    stroke={index % 5 === 0 ? 'rgba(31, 33, 34, 0.52)' : 'rgba(31, 33, 34, 0.26)'}
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
                    fill="rgba(0, 0, 0, 0.92)"
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
            </g>

            <g opacity={dialOpacity} pointerEvents="none">
              <line
                x1={CLOCK_CENTER.x}
                y1={CLOCK_CENTER.y}
                x2={CLOCK_CENTER.x}
                y2={CLOCK_CENTER.y - 140}
                stroke="var(--ink)"
                strokeWidth={8}
                strokeLinecap="round"
                transform={`rotate(${getAnimatedHandAngle(handBaseAngles.hourArbor, analysis.handStates.hourArbor.rpm, playbackMs, isPlaying)} 0 0)`}
              />
              <line
                x1={CLOCK_CENTER.x}
                y1={CLOCK_CENTER.y}
                x2={CLOCK_CENTER.x}
                y2={CLOCK_CENTER.y - 215}
                stroke="var(--ink)"
                strokeWidth={5.5}
                strokeLinecap="round"
                transform={`rotate(${getAnimatedHandAngle(handBaseAngles.minuteArbor, analysis.handStates.minuteArbor.rpm, playbackMs, isPlaying)} 0 0)`}
              />
              <line
                x1={CLOCK_CENTER.x}
                y1={CLOCK_CENTER.y + 28}
                x2={CLOCK_CENTER.x}
                y2={CLOCK_CENTER.y - 280}
                stroke="var(--ink)"
                strokeWidth={3}
                strokeLinecap="round"
                transform={`rotate(${getAnimatedHandAngle(handBaseAngles.secondArbor, analysis.handStates.secondArbor.rpm, playbackMs, isPlaying)} 0 0)`}
              />
              <circle cx={0} cy={0} r={5} fill="var(--ink)" />
            </g>
          </svg>

          <div className="workspace-caption">Drag empty canvas to pan</div>
        </div>
      </section>

      <aside className="sidebar">
        <div className="panel">
          <h1>Clockwork Atelier</h1>
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
          <h2>Layers</h2>
          <div className="layer-list">
            {sortedLayers.map((layer) => (
              <button
                key={layer.id}
                className="layer-button"
                data-active={activeLayerId === layer.id}
                data-testid={`layer-button-${layer.order}`}
                onClick={() => toggleLayer(layer.id)}
                type="button"
              >
                {layer.name}
              </button>
            ))}
            <button
              className="layer-button"
              data-testid="new-layer-button"
              onClick={() => addLayer()}
              type="button"
            >
              New Layer
            </button>
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
