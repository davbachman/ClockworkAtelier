import * as THREE from 'three'

export function fitMechanicalCamera(camera: THREE.PerspectiveCamera, bounds: THREE.Box3) {
  const center = bounds.getCenter(new THREE.Vector3())
  const direction = new THREE.Vector3(0, -850, 1350).normalize()
  camera.position.copy(center).add(direction)
  camera.lookAt(center)
  camera.zoom = 1
  const inverseRotation = camera.quaternion.clone().invert()
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const tanHorizontal = tanVertical * camera.aspect
  let distance = 1
  // Fit all eight corners, accounting for each corner's depth in perspective.
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation)
        distance = Math.max(distance, corner.z + 1.15 * Math.max(
          Math.abs(corner.x) / tanHorizontal, Math.abs(corner.y) / tanVertical,
        ))
      }
    }
  }
  camera.position.copy(center).addScaledVector(direction, distance)
  camera.far = Math.max(10000, distance * 5 + bounds.getSize(new THREE.Vector3()).length())
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return { center, distance }
}
