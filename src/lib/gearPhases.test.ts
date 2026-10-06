import { GEAR_TOOTH_CENTER_FRACTION, getPitchRadius } from './geometry'
import { gearsMesh, getGearPhases, getMeshingRotation } from './gearPhases'
import type { Gear } from './types'

const TAU = Math.PI * 2
const gear = (id: string, teeth: number, x: number, y: number, layerId = 'layer-1'): Gear =>
  ({ id, teeth, center: { x, y }, layerId })

function expectAligned(a: Gear, rotationA: number, b: Gear, rotationB: number) {
  const direction = Math.atan2(a.center.y - b.center.y, b.center.x - a.center.x)
  const phaseA = (direction - rotationA + Math.PI / 2) * a.teeth / TAU - GEAR_TOOTH_CENTER_FRACTION
  const phaseB = (direction + Math.PI - rotationB + Math.PI / 2) * b.teeth / TAU - GEAR_TOOTH_CENTER_FRACTION
  const phaseSum = phaseA + phaseB
  expect(phaseSum - Math.floor(phaseSum)).toBeCloseTo(0.5, 9)
}

describe('3D gear tooth alignment', () => {
  it.each([0, 0.43, Math.PI / 2, 2.7, -1.1])('aligns unequal gears along direction %f throughout rotation', (direction) => {
    const a = gear('a', 37, 50, -20)
    const distance = getPitchRadius(37) + getPitchRadius(120)
    const b = gear('b', 120, 50 + Math.cos(direction) * distance, -20 + Math.sin(direction) * distance)
    const phase = getMeshingRotation(a, 0, b)
    for (const turns of [0, 0.003, 0.03, 0.4, 1, 13.25]) {
      expectAligned(a, -turns * TAU, b, phase + turns * TAU * a.teeth / b.teeth)
    }
  })

  it('propagates alignment through a chain without aligning different layers or separated gears', () => {
    const a = gear('a', 40, 0, 0)
    const b = gear('b', 80, getPitchRadius(40) + getPitchRadius(80), 0)
    const c = gear('c', 24, b.center.x, getPitchRadius(80) + getPitchRadius(24))
    const otherLayer = { ...b, id: 'other', layerId: 'layer-2' }
    const isolated = gear('isolated', 40, -1000, 0)
    const phases = getGearPhases([a, c, b, otherLayer, isolated])
    expectAligned(a, phases.get('a')!, b, phases.get('b')!)
    expectAligned(b, phases.get('b')!, c, phases.get('c')!)
    expect(gearsMesh(a, otherLayer)).toBe(false)
    expect(phases.get('other')).toBe(0)
    expect(phases.get('isolated')).toBe(0)
  })

  it('aligns a placement preview to its already rotating neighbor', () => {
    const a = gear('a', 60, 0, 0)
    const b = gear('b', 30, 0, getPitchRadius(60) + getPitchRadius(30))
    expectAligned(a, 2.43, b, getMeshingRotation(a, 2.43, b))
  })
})
