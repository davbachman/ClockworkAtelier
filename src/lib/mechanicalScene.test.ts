import * as THREE from 'three'
import { CLOCK_LAYERS, CLOCK_OUTPUTS, DIAL_OUTER_RADIUS } from './constants'
import { createMechanicalGear, createMechanicalModel, disposeObject, setClockLayerFocus } from './mechanicalScene'
import type { MechanicalModel } from './mechanicalScene'
import { getMeshingRotation } from './gearPhases'
import { getPitchRadius } from './geometry'

describe('3D gear outlines', () => {
  it.each([[120, 120], [120, 100], [40, 80], [24, 120]])('keeps %i/%i-tooth gear surfaces clear through a tooth cycle', (teethA, teethB) => {
    const a = { teeth: teethA, center: { x: 0, y: 0 }, layerId: 'layer-1' }
    const b = { teeth: teethB, center: { x: getPitchRadius(teethA) + getPitchRadius(teethB), y: 0 }, layerId: 'layer-1' }
    const first = createMechanicalGear(teethA)
    const second = createMechanicalGear(teethB)
    second.position.x = b.center.x
    const phase = getMeshingRotation(a, 0, b)
    const surfaceA = first.children[0] as THREE.Mesh
    const surfaceB = second.children[0] as THREE.Mesh
    const vertices = surfaceA.geometry.getAttribute('position')
    const point = new THREE.Vector3()
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1))
    try {
      for (let step = 0; step < 10; step++) {
        first.rotation.z = step / 10 * Math.PI * 2 / teethA
        second.rotation.z = phase - first.rotation.z * teethA / teethB
        first.updateMatrixWorld(true)
        second.updateMatrixWorld(true)
        for (let index = 0; index < vertices.count; index++) {
          point.fromBufferAttribute(vertices, index).applyMatrix4(first.matrixWorld)
          if (point.x < getPitchRadius(teethA) - 10) continue
          ray.ray.origin.set(point.x, point.y, 20)
          expect(ray.intersectObject(surfaceB, false)).toHaveLength(0)
        }
      }
    } finally {
      disposeObject(first)
      disposeObject(second)
    }
  })

  it.each([24, 120])('outlines every visible part of a %i-tooth gear, but not its pick surface', (teeth) => {
    const gear = createMechanicalGear(teeth)
    const parts = gear.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh)
    for (const part of parts) {
      const material = part.material as THREE.Material
      if (!material.colorWrite) {
        expect(part.children).toHaveLength(0)
        continue
      }
      const edges = part.children[0] as THREE.LineSegments
      expect(edges).toBeInstanceOf(THREE.LineSegments)
      expect(edges.geometry).toBeInstanceOf(THREE.EdgesGeometry)
      edges.geometry.computeBoundingBox()
      expect(edges.geometry.boundingBox!.min.z).toBeLessThan(edges.geometry.boundingBox!.max.z)
    }
    disposeObject(gear)
  })
})

describe('3D clock layers', () => {
  let model: MechanicalModel

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      translate: vi.fn(), scale: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
      stroke: vi.fn(), fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    model = createMechanicalModel('clock', [
      { id: 'first', layerId: 'layer-1', teeth: 40, center: { x: 0, y: 0 } },
      { id: 'last', layerId: 'layer-5', teeth: 40, center: { x: 100, y: 0 } },
    ], CLOCK_LAYERS, CLOCK_OUTPUTS)
    model.root.updateMatrixWorld(true)
  })

  afterEach(() => {
    disposeObject(model.root)
    model.textures.forEach((texture) => texture.dispose())
    vi.restoreAllMocks()
  })

  function materials(object: THREE.Object3D) {
    const result = new Set<THREE.Material>()
    object.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) result.add(material)
      }
    })
    return [...result]
  }

  it('places an opaque clock-face ring above every gear and below every hand', () => {
    const face = model.root.getObjectByName('clock-face')!
    const faceBounds = new THREE.Box3().setFromObject(face)
    for (const gear of model.gears.values()) {
      expect(new THREE.Box3().setFromObject(gear).max.z).toBeLessThan(faceBounds.min.z)
    }
    for (const hand of model.outputs.values()) {
      expect(new THREE.Box3().setFromObject(hand).min.z).toBeGreaterThan(faceBounds.max.z)
    }
    const surface = face.children[0] as THREE.Mesh<THREE.ExtrudeGeometry, THREE.Material>
    const shape = surface.geometry.parameters.shapes as THREE.Shape
    expect(shape.holes).toHaveLength(1)
    expect(shape.holes[0].getPoint(0).length()).toBeCloseTo(DIAL_OUTER_RADIUS * 0.78)
    expect(surface.material.opacity).toBe(1)
    expect(surface.material.transparent).toBe(false)
    expect(surface.material.depthWrite).toBe(true)
  })

  it('keeps the center of the clock face open with or without a selected layer', () => {
    const surface = model.root.getObjectByName('clock-face')!.children[0] as THREE.Mesh
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1))
    for (const layer of [null, 'layer-1', 'layer-5', null]) {
      setClockLayerFocus(model, layer)
      for (const radius of [0, DIAL_OUTER_RADIUS * 0.5, DIAL_OUTER_RADIUS * 0.77]) {
        ray.ray.origin.set(radius, 0, 1000)
        expect(ray.intersectObject(surface, false)).toHaveLength(0)
      }
      ray.ray.origin.set(DIAL_OUTER_RADIUS * 0.9, 0, 1000)
      expect(ray.intersectObject(surface, false).length).toBeGreaterThan(0)
    }
  })

  it('fades unrelated parts, including shadows, and restores the overview', () => {
    setClockLayerFocus(model, 'layer-1')
    const unrelated = [model.gears.get('last')!, model.outputs.get('dayArbor')!, model.root.getObjectByName('clock-face')!, model.root.getObjectByName('dial-dayArbor')!]
    for (const object of unrelated) {
      for (const material of materials(object)) {
        expect(material.opacity).toBeLessThanOrEqual(0.15)
        expect(material.transparent).toBe(true)
        expect(material.depthWrite).toBe(false)
      }
      object.traverse((child) => expect(child.castShadow).toBe(false))
    }
    expect(materials(model.outputs.get('secondArbor')!)[0].opacity).toBe(1)
    expect(materials(model.gears.get('first')!)[0].opacity).toBe(1)
    setClockLayerFocus(model, 'layer-5')
    expect(materials(model.root.getObjectByName('dial-dayArbor')!)[0].opacity).toBe(1)
    expect(materials(model.outputs.get('dayArbor')!)[0].opacity).toBe(1)
    setClockLayerFocus(model, null)
    const surface = model.root.getObjectByName('clock-face')!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material>
    expect(surface.material.opacity).toBe(1)
    expect(surface.material.transparent).toBe(false)
    expect(surface.material.depthWrite).toBe(true)
    expect(surface.castShadow).toBe(true)
  })
})
