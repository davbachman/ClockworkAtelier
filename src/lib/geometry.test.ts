import { AM_PM_DIAL_CENTER, BASE_LAYERS, MOTOR_CENTER, WORKSPACE_CENTER, getModeConfig } from './constants'
import {
  getLayerVisualState,
  getPitchRadius,
  resolvePlacement,
} from './geometry'

describe('geometry', () => {
  it('snaps a same-layer clock gear into mesh contact', () => {
    const existingGear = {
      id: 'gear-1',
      teeth: 30,
      layerId: 'layer-1',
      center: { x: 0, y: 0 },
    }
    const targetDistance = getPitchRadius(30) + getPitchRadius(18)

    const result = resolvePlacement({
      mode: 'clock',
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
      mode: 'clock',
      draftGear: {
        teeth: 20,
        layerId: 'layer-1',
        center: {
          x: existingGear.center.x + 12,
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

  it('blocks clock layers above the hand stack from entering the center arbor zone', () => {
    const layers = [...getModeConfig('clock').layers, { id: 'layer-6', name: 'Layer 6', order: 6 }]

    const result = resolvePlacement({
      mode: 'clock',
      draftGear: {
        teeth: 22,
        layerId: 'layer-6',
        center: { x: WORKSPACE_CENTER.x + 8, y: WORKSPACE_CENTER.y },
      },
      gears: [],
      layers,
    })

    expect(result.state).toBe('invalidOverlap')
    expect(result.highlightedAnchors).toEqual(
      expect.arrayContaining(['secondArbor', 'minuteArbor', 'hourArbor']),
    )
  })

  it('allows a motor-bound gear to snap coaxially', () => {
    const result = resolvePlacement({
      mode: 'clock',
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

  it('allows the AM/PM clock layer to snap into its offset arbor', () => {
    const result = resolvePlacement({
      mode: 'clock',
      draftGear: {
        teeth: 20,
        layerId: 'layer-4',
        center: { x: AM_PM_DIAL_CENTER.x + 6, y: AM_PM_DIAL_CENTER.y },
      },
      gears: [],
      layers: getModeConfig('clock').layers,
    })

    expect(result.state).toBe('coaxialSnap')
    expect(result.center).toEqual(AM_PM_DIAL_CENTER)
    expect(result.highlightedAnchors).toEqual(['amPmArbor'])
  })

  it('allows a gear to mesh with a gear centered on an arbor regardless of size', () => {
    const centeredGear = {
      id: 'gear-1',
      teeth: 10,
      layerId: 'layer-3',
      center: WORKSPACE_CENTER,
    }
    const targetDistance = getPitchRadius(10) + getPitchRadius(100)

    const result = resolvePlacement({
      mode: 'clock',
      draftGear: {
        teeth: 100,
        layerId: 'layer-3',
        center: { x: 12, y: -170 },
      },
      gears: [centeredGear],
      layers: BASE_LAYERS,
    })

    expect(result.state).toBe('meshSnap')
    expect(Math.hypot(result.center.x, result.center.y)).toBeCloseTo(targetDistance, 4)
    expect(result.highlightedGearIds).toEqual(['gear-1'])
    expect(result.highlightedAnchors).toEqual([])
  })

  it('allows an orrery layer to snap into its own center arbor', () => {
    const result = resolvePlacement({
      mode: 'orrery',
      draftGear: {
        teeth: 20,
        layerId: 'layer-3',
        center: { x: WORKSPACE_CENTER.x + 6, y: WORKSPACE_CENTER.y },
      },
      gears: [],
      layers: [
        { id: 'layer-1', name: 'Mercury', order: 1 },
        { id: 'layer-2', name: 'Venus', order: 2 },
        { id: 'layer-3', name: 'Earth', order: 3 },
      ],
    })

    expect(result.state).toBe('coaxialSnap')
    expect(result.center).toEqual(WORKSPACE_CENTER)
    expect(result.highlightedAnchors).toEqual(['earthArbor'])
  })

  it('recognizes active, above, and below layer tones', () => {
    expect(getLayerVisualState(2, null)).toBe('neutral')
    expect(getLayerVisualState(2, 2)).toBe('active')
    expect(getLayerVisualState(3, 2)).toBe('above')
    expect(getLayerVisualState(1, 2)).toBe('below')
  })
})
