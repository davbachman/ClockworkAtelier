import * as THREE from 'three'
import { fitMechanicalCamera } from './mechanicalCamera'

describe('perspective mechanism camera', () => {
  it.each([0.45, 1, 1.6, 3])('fits the full mechanism at aspect ratio %s', (aspect) => {
    const camera = new THREE.PerspectiveCamera(40, aspect, 1, 10000)
    camera.up.set(0, 0, 1)
    const bounds = new THREE.Box3(new THREE.Vector3(-1100, -445, 0), new THREE.Vector3(445, 750, 202))
    const { center, distance } = fitMechanicalCamera(camera, bounds)
    expect(camera.position.distanceTo(center)).toBeCloseTo(distance)
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera)
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1 / 1.15 + 1e-10)
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1 / 1.15 + 1e-10)
          expect(Math.abs(projected.z)).toBeLessThan(1)
        }
      }
    }
  })

  it('makes closer objects larger and resets a previously zoomed camera on fit', () => {
    const camera = new THREE.PerspectiveCamera(40, 1.5, 1, 10000)
    camera.up.set(0, 0, 1)
    camera.zoom = 3
    const bounds = new THREE.Box3(new THREE.Vector3(-475, -380, 0), new THREE.Vector3(380, 380, 136))
    const { center } = fitMechanicalCamera(camera, bounds)
    const towardCamera = camera.position.clone().sub(center).normalize()
    const projectedWidth = (depth: number) => {
      const start = center.clone().addScaledVector(towardCamera, depth)
      return start.clone().add(new THREE.Vector3(100, 0, 0)).project(camera).x - start.project(camera).x
    }
    expect(camera.zoom).toBe(1)
    expect(projectedWidth(200)).toBeGreaterThan(projectedWidth(-200))
  })
})
