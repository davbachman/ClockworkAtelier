import {
  BASE_LAYERS,
  CLOCK_CENTER,
  COAXIAL_SNAP_TOLERANCE,
  MOTOR_CENTER,
} from './constants'
import {
  getLayerVisualState,
  getOuterRadius,
  getPitchRadius,
  resolvePlacement,
} from './geometry'

describe('geometry', () => {
  it('snaps a same-layer gear into mesh contact', () => {
    const existingGear = {
      id: 'gear-1',
      teeth: 30,
      layerId: 'layer-1',
      center: { x: 0, y: 0 },
    }
    const targetDistance = getPitchRadius(30) + getPitchRadius(18)

    const result = resolvePlacement({
      draftGear: {
        teeth: 18,
        layerId: 'layer-1',
        center: { x: targetDistance + 8, y: 0 },
      },
      gears: [existingGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('meshSnap')
    expect(result.center.x).toBeCloseTo(targetDistance, 4)
    expect(result.highlightedGearIds).toEqual(['gear-1'])
  })

  it('snaps a different-layer gear into a coaxial position', () => {
    const existingGear = {
      id: 'gear-1',
      teeth: 42,
      layerId: 'layer-2',
      center: { x: 140, y: -90 },
    }

    const result = resolvePlacement({
      draftGear: {
        teeth: 20,
        layerId: 'layer-1',
        center: {
          x: existingGear.center.x + COAXIAL_SNAP_TOLERANCE - 3,
          y: existingGear.center.y,
        },
      },
      gears: [existingGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('coaxialSnap')
    expect(result.center).toEqual(existingGear.center)
    expect(result.highlightedGearIds).toEqual(['gear-1'])
  })

  it('marks same-layer overlap as invalid', () => {
    const existingGear = {
      id: 'gear-1',
      teeth: 40,
      layerId: 'layer-1',
      center: { x: 0, y: 0 },
    }

    const result = resolvePlacement({
      draftGear: {
        teeth: 40,
        layerId: 'layer-1',
        center: { x: getPitchRadius(40), y: 0 },
      },
      gears: [existingGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('invalidOverlap')
    expect(result.highlightedGearIds).toEqual(['gear-1'])
  })

  it('disallows higher layers from entering the arbor zone', () => {
    const layers = [...BASE_LAYERS, { id: 'layer-4', name: 'Layer 4', order: 4 }]

    const result = resolvePlacement({
      draftGear: {
        teeth: 22,
        layerId: 'layer-4',
        center: { x: CLOCK_CENTER.x + 8, y: CLOCK_CENTER.y },
      },
      gears: [],
      layers,
    })

    expect(result.state).toBe('invalidOverlap')
    expect(result.highlightedAnchors).toEqual(
      expect.arrayContaining(['secondArbor', 'minuteArbor', 'hourArbor']),
    )
  })

  it('recognizes active, above, and below layer tones', () => {
    expect(getLayerVisualState(2, null)).toBe('neutral')
    expect(getLayerVisualState(2, 2)).toBe('active')
    expect(getLayerVisualState(3, 2)).toBe('above')
    expect(getLayerVisualState(1, 2)).toBe('below')
  })

  it('allows a motor-bound gear to snap coaxially', () => {
    const result = resolvePlacement({
      draftGear: {
        teeth: 24,
        layerId: 'layer-2',
        center: { x: MOTOR_CENTER.x + 6, y: MOTOR_CENTER.y + 4 },
      },
      gears: [],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('coaxialSnap')
    expect(result.center).toEqual(MOTOR_CENTER)
    expect(result.highlightedAnchors).toEqual(['motor'])
  })

  it('allows a meshing gear next to a second-hand arbor gear', () => {
    const centerGear = {
      id: 'gear-1',
      teeth: 12,
      layerId: 'layer-1',
      center: CLOCK_CENTER,
    }
    const targetDistance = getPitchRadius(centerGear.teeth) + getPitchRadius(12)

    const result = resolvePlacement({
      draftGear: {
        teeth: 12,
        layerId: 'layer-1',
        center: { x: targetDistance + 4, y: 0 },
      },
      gears: [centerGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('meshSnap')
    expect(result.center.x).toBeCloseTo(targetDistance, 4)
    expect(result.highlightedGearIds).toEqual(['gear-1'])
  })

  it('snaps a gear into a two-gear mesh intersection', () => {
    const leftGear = {
      id: 'gear-1',
      teeth: 24,
      layerId: 'layer-1',
      center: { x: -40, y: 0 },
    }
    const rightGear = {
      id: 'gear-2',
      teeth: 24,
      layerId: 'layer-1',
      center: { x: 40, y: 0 },
    }
    const targetDistance = getPitchRadius(24) + getPitchRadius(24)
    const targetY = -Math.sqrt(Math.max(0, targetDistance * targetDistance - 40 * 40))

    const result = resolvePlacement({
      draftGear: {
        teeth: 24,
        layerId: 'layer-1',
        center: { x: 0, y: targetY + 7 },
      },
      gears: [leftGear, rightGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('meshSnap')
    expect(result.center.x).toBeCloseTo(0, 4)
    expect(result.center.y).toBeCloseTo(targetY, 4)
    expect(result.highlightedGearIds).toEqual(expect.arrayContaining(['gear-1', 'gear-2']))
  })

  it('prefers a valid dual-mesh snap over an invalid single-gear snap', () => {
    const leftGear = {
      id: 'gear-1',
      teeth: 24,
      layerId: 'layer-1',
      center: { x: -40, y: 0 },
    }
    const rightGear = {
      id: 'gear-2',
      teeth: 24,
      layerId: 'layer-1',
      center: { x: 40, y: 0 },
    }
    const targetDistance = getPitchRadius(24) + getPitchRadius(24)
    const targetY = -Math.sqrt(Math.max(0, targetDistance * targetDistance - 40 * 40))

    const result = resolvePlacement({
      draftGear: {
        teeth: 24,
        layerId: 'layer-1',
        center: { x: -10, y: targetY + 2 },
      },
      gears: [leftGear, rightGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('meshSnap')
    expect(result.center.x).toBeCloseTo(0, 4)
    expect(result.center.y).toBeCloseTo(targetY, 4)
    expect(result.highlightedGearIds).toEqual(expect.arrayContaining(['gear-1', 'gear-2']))
  })

  it('blocks a placement that would close an impossible loop and highlights that loop', () => {
    const radius = getPitchRadius(20)
    const gearA = {
      id: 'gear-1',
      teeth: 20,
      layerId: 'layer-1',
      center: { x: 180, y: -120 },
    }
    const gearB = {
      id: 'gear-2',
      teeth: 20,
      layerId: 'layer-1',
      center: { x: gearA.center.x + radius * 2, y: gearA.center.y },
    }
    const branchGear = {
      id: 'gear-branch',
      teeth: 20,
      layerId: 'layer-1',
      center: { x: gearB.center.x + radius * 2, y: gearB.center.y },
    }
    const targetCenter = {
      x: gearA.center.x + radius,
      y: gearA.center.y + Math.sqrt(3) * radius,
    }

    const result = resolvePlacement({
      draftGear: {
        teeth: 20,
        layerId: 'layer-1',
        center: { x: targetCenter.x + 6, y: targetCenter.y - 4 },
      },
      gears: [gearA, gearB, branchGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('invalidLoop')
    expect(result.center.x).toBeCloseTo(targetCenter.x, 4)
    expect(result.center.y).toBeCloseTo(targetCenter.y, 4)
    expect(result.highlightedGearIds).toEqual(expect.arrayContaining(['gear-1', 'gear-2']))
    expect(result.highlightedGearIds).not.toContain('gear-branch')
  })

  it('does not block placement because of an unrelated impossible loop elsewhere', () => {
    const radius = getPitchRadius(18)
    const gearA = {
      id: 'gear-1',
      teeth: 18,
      layerId: 'layer-1',
      center: { x: 180, y: -120 },
    }
    const gearB = {
      id: 'gear-2',
      teeth: 18,
      layerId: 'layer-1',
      center: { x: gearA.center.x + radius * 2, y: gearA.center.y },
    }
    const gearC = {
      id: 'gear-3',
      teeth: 18,
      layerId: 'layer-1',
      center: {
        x: gearA.center.x + radius,
        y: gearA.center.y + Math.sqrt(3) * radius,
      },
    }

    const result = resolvePlacement({
      draftGear: {
        teeth: 24,
        layerId: 'layer-2',
        center: { x: 320, y: 210 },
      },
      gears: [gearA, gearB, gearC],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('free')
    expect(result.highlightedGearIds).toEqual([])
    expect(result.highlightedAnchors).toEqual([])
  })

  it('still blocks higher layers from overlapping the arbor stack with their gear body', () => {
    const layers = [...BASE_LAYERS, { id: 'layer-4', name: 'Layer 4', order: 4 }]

    const result = resolvePlacement({
      draftGear: {
        teeth: 16,
        layerId: 'layer-4',
        center: { x: getOuterRadius(16) + 18, y: 0 },
      },
      gears: [],
      layers,
    })

    expect(result.state).toBe('invalidOverlap')
    expect(result.highlightedAnchors.length).toBeGreaterThan(0)
  })
})
