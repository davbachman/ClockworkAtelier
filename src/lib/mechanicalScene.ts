import * as THREE from 'three'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { createGearPath, getRootRadius, getOuterRadius } from './geometry'
import { getGearPhases } from './gearPhases'
import { DIAL_OUTER_RADIUS, MOTOR_CENTER, ROMAN_NUMERALS, WEEKDAY_NAMES } from './constants'
import { PLANET_ASSETS } from './planetAssets'
import { SUN_ART_ASSET } from './orreryAssets'
import type { EditorMode, Gear, Layer, OutputTarget } from './types'

export const LAYER_HEIGHT = 22
export const gearHeight = (order: number) => 12 + (order - 1) * LAYER_HEIGHT
const DIAL_INNER_RADIUS_RATIO = 0.78

export interface MechanicalModel {
  root: THREE.Group
  gears: Map<string, THREE.Group>
  gearPhases: Map<string, number>
  outputs: Map<string, THREE.Group>
  planets: THREE.Object3D[]
  textures: THREE.Texture[]
  layerElements: Array<{ object: THREE.Object3D; layerIds: string[] }>
}

function metal(color: number, roughness = 0.4) {
  return new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness })
}

function solid(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function ringShape(outer: number, inner: number) {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  return shape
}

function extrude(shape: THREE.Shape, depth: number, gearTeeth = false) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 1, steps: 1,
    // Tooth bevels stay inside the pitch profile, with a small running clearance.
    bevelSize: gearTeeth ? 0.3 : 0.6, bevelThickness: gearTeeth ? 0.3 : 0.6,
    bevelOffset: gearTeeth ? -0.8 : 0, curveSegments: 32,
  })
}

export function createMechanicalGear(teeth: number, color = 0x68737d, edgeColor = 0x393c3f) {
  const group = new THREE.Group()
  const material = metal(color)
  material.polygonOffset = true
  material.polygonOffsetFactor = 1
  material.polygonOffsetUnits = 1
  const edgeMaterial = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.85, depthWrite: false })
  function outlinedSolid(geometry: THREE.BufferGeometry) {
    const mesh = solid(geometry, material)
    // Trace physical edges, excluding triangulation and smooth curved surfaces.
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), edgeMaterial))
    return mesh
  }
  const root = getRootRadius(teeth)
  const path = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${createGearPath({ x: 0, y: 0 }, teeth)}"/></svg>`).paths[0]
  const shape = path.toShapes()[0]
  const open = teeth > 30
  const rim = Math.max(12, root - (teeth >= 150 ? 24 : 12))
  const hole = new THREE.Path()
  hole.absarc(0, 0, open ? rim : 6, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geometry = extrude(shape, 11, true)
  group.add(outlinedSolid(geometry))
  if (open) {
    const hub = 15
    group.add(outlinedSolid(extrude(ringShape(hub, 6), 11)))
    for (let index = 0; index < 5; index++) {
      const angle = index * Math.PI * 2 / 5
      const arm = outlinedSolid(new THREE.BoxGeometry(rim - hub + 4, 8, 10))
      arm.position.set(Math.cos(angle) * (rim + hub) / 2, Math.sin(angle) * (rim + hub) / 2, 5)
      arm.rotation.z = angle
      group.add(arm)
    }
  }
  // A continuous pick surface keeps spokes and the center bore easy to grab.
  const hitArea = new THREE.Mesh(new THREE.CircleGeometry(getOuterRadius(teeth), 48),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }))
  hitArea.position.z = 12
  group.add(hitArea)
  return group
}

function axle(parent: THREE.Group, x: number, y: number, height: number, radius = 5) {
  const group = new THREE.Group()
  parent.add(group)
  const pin = solid(new THREE.CylinderGeometry(radius, radius, height, 24), metal(0xb39b6b))
  pin.rotation.x = Math.PI / 2
  pin.position.set(x, -y, height / 2)
  group.add(pin)
  const collar = solid(extrude(ringShape(radius + 5, radius), 4), metal(0xcbb98b))
  collar.position.set(x, -y, height)
  group.add(collar)
  return group
}

function dialTexture(labels: readonly string[], radius: number, dark: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1024
  const context = canvas.getContext('2d')!
  context.translate(512, 512)
  context.scale(480 / radius, 480 / radius)
  context.strokeStyle = dark ? '#bfb399' : '#716953'
  context.fillStyle = context.strokeStyle
  context.lineWidth = 1.5
  for (const r of [radius, radius - 10, radius * DIAL_INNER_RADIUS_RATIO]) {
    context.beginPath()
    context.arc(0, 0, r, 0, Math.PI * 2)
    context.stroke()
  }
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `${radius > 100 ? 32 : 10}px Georgia`
  labels.forEach((label, index) => {
    const angle = index * Math.PI * 2 / labels.length - Math.PI / 2
    context.fillText(label, Math.cos(angle) * radius * 0.88, Math.sin(angle) * radius * 0.88)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function createMechanicalModel(mode: EditorMode, gears: Gear[], layers: Layer[], outputs: OutputTarget[]) {
  const model: MechanicalModel = {
    root: new THREE.Group(), gears: new Map(), outputs: new Map(), planets: [], textures: [],
    gearPhases: getGearPhases(gears),
    layerElements: [],
  }
  const dark = mode === 'orrery'
  const loader = new THREE.TextureLoader()
  const tallest = Math.max(12,
    ...gears.map((gear) => gearHeight(layers.find((layer) => layer.id === gear.layerId)?.order ?? 1)),
    ...(mode === 'clock' ? layers.map((layer) => gearHeight(layer.order)) : []),
  ) + 18
  const arbors = new Map<string, { x: number; y: number; height: number; layerIds: string[] }>()
  for (const gear of gears) {
    const order = layers.find((layer) => layer.id === gear.layerId)?.order ?? 1
    const object = createMechanicalGear(gear.teeth, dark ? 0x43515e : 0x9e9276, dark ? 0x9caab4 : 0x514b40)
    object.position.set(gear.center.x, -gear.center.y, gearHeight(order))
    object.rotation.z = model.gearPhases.get(gear.id) ?? 0
    object.userData.gearId = gear.id
    object.traverse((child) => { child.userData.gearId = gear.id })
    model.root.add(object)
    model.gears.set(gear.id, object)
    model.layerElements.push({ object, layerIds: [gear.layerId] })
    const key = `${gear.center.x.toFixed(1)},${gear.center.y.toFixed(1)}`
    const height = Math.max(arbors.get(key)?.height ?? 0, gearHeight(order) + 14)
    arbors.set(key, { ...gear.center, height, layerIds: [...(arbors.get(key)?.layerIds ?? []), gear.layerId] })
  }
  for (const arbor of arbors.values()) {
    model.layerElements.push({ object: axle(model.root, arbor.x, arbor.y, arbor.height), layerIds: arbor.layerIds })
  }
  model.layerElements.push({ object: axle(model.root, MOTOR_CENTER.x, MOTOR_CENTER.y, tallest, 9), layerIds: layers.map((layer) => layer.id) })
  for (const output of outputs) {
    const layerIds = layers.filter((layer) => layer.order === output.layerOrder).map((layer) => layer.id)
    model.layerElements.push({ object: axle(model.root, output.center.x, output.center.y, tallest + output.layerOrder * 5, output.arborRadius / 2), layerIds })
  }

  function artwork(url: string, size: number) {
    const texture = loader.load(url)
    texture.colorSpace = THREE.SRGBColorSpace
    model.textures.push(texture)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.01, side: THREE.DoubleSide, toneMapped: false }))
    return mesh
  }

  function dial(labels: readonly string[], radius: number, x: number, y: number, layerIds: string[] = [], name = 'clock-face') {
    const group = new THREE.Group()
    group.name = name
    group.position.set(x, -y, tallest + (radius > 100 ? 0 : 3))
    const faceShape = name === 'clock-face'
      ? ringShape(radius, radius * DIAL_INNER_RADIUS_RATIO)
      : new THREE.Shape().absarc(0, 0, radius, 0, Math.PI * 2, false)
    const face = solid(extrude(faceShape, 2), new THREE.MeshStandardMaterial({ color: 0xeee6d5, roughness: 0.8 }))
    group.add(face)
    const texture = dialTexture(labels, radius, dark)
    model.textures.push(texture)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.14, radius * 2.14),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.01, depthWrite: false, side: THREE.DoubleSide }))
    mesh.position.z = 2.8
    group.add(mesh)
    model.root.add(group)
    model.layerElements.push({ object: group, layerIds })
  }

  if (mode === 'clock') dial(ROMAN_NUMERALS, DIAL_OUTER_RADIUS, 0, 0)
  for (const output of outputs) {
    const group = new THREE.Group()
    group.position.set(output.center.x, -output.center.y, tallest + output.layerOrder * 7)
    model.outputs.set(output.id, group)
    const layerIds = layers.filter((layer) => layer.order === output.layerOrder).map((layer) => layer.id)
    model.layerElements.push({ object: group, layerIds })
    model.root.add(group)
    const length = mode === 'orrery' ? output.orbitRadius! :
      output.id === 'secondArbor' ? 268 : output.id === 'minuteArbor' ? 220 : output.id === 'hourArbor' ? 165 : 54
    const width = mode === 'orrery' ? 5 : output.id === 'secondArbor' ? 3 : 7
    const arm = solid(new THREE.BoxGeometry(width, length, 4), metal(mode === 'orrery' ? 0xb79b61 : 0x434341))
    arm.position.set(0, length / 2, 2)
    group.add(arm)
    if (mode === 'orrery') {
      const size = output.assetId === 'saturn' ? 72 : output.assetId === 'jupiter' ? 60 : 48
      const disc = solid(new THREE.CylinderGeometry(size * 0.4, size * 0.4, 6, 48), metal(0xc4b383))
      disc.rotation.x = Math.PI / 2
      disc.position.set(0, length, 5)
      group.add(disc)
      const face = artwork(PLANET_ASSETS[output.assetId as keyof typeof PLANET_ASSETS], size)
      const backing = new THREE.Mesh(new THREE.CircleGeometry(size * 0.4, 48), new THREE.MeshBasicMaterial({ color: 0x10151d }))
      backing.position.set(0, length, 8.5)
      group.add(backing)
      face.position.set(0, length, 9)
      face.userData.outputId = output.id
      group.add(face)
      model.planets.push(face)
    } else if (output.id === 'amPmArbor' || output.id === 'dayArbor') {
      dial(output.id === 'dayArbor' ? WEEKDAY_NAMES.map((name) => name.slice(0, 3)) : ['PM', 'AM'], 72, output.center.x, output.center.y, layerIds, `dial-${output.id}`)
    }
  }
  if (mode === 'orrery') {
    const group = new THREE.Group()
    group.name = 'sun'
    const sun = artwork(SUN_ART_ASSET, 140)
    sun.position.set(0, 0, tallest + 55)
    const backing = new THREE.Mesh(new THREE.CircleGeometry(52, 64), new THREE.MeshBasicMaterial({ color: 0x10151d }))
    backing.position.set(0, 0, tallest + 54)
    group.add(backing, sun)
    axle(group, 0, 0, tallest + 43, 35)
    model.root.add(group)
    model.layerElements.push({ object: group, layerIds: [] })
  }
  return model
}

const materialAppearance = new WeakMap<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>()
const shadowAppearance = new WeakMap<THREE.Object3D, boolean>()

export function setMechanicalLayerFocus(model: MechanicalModel, activeLayerId: string | null) {
  for (const { object, layerIds } of model.layerElements) {
    const faded = activeLayerId !== null && !layerIds.includes(activeLayerId)
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh || child instanceof THREE.Line)) return
      if (!shadowAppearance.has(child)) shadowAppearance.set(child, child.castShadow)
      // Ghosted parts must not leave opaque shadows or block the selected layer's depth.
      child.castShadow = faded ? false : shadowAppearance.get(child)!
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (!materialAppearance.has(material)) {
          materialAppearance.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite })
        }
        const original = materialAppearance.get(material)!
        const transparent = faded || original.transparent
        if (material.transparent !== transparent) material.needsUpdate = true
        material.transparent = transparent
        material.opacity = original.opacity * (faded ? 0.15 : 1)
        material.depthWrite = faded ? false : original.depthWrite
      }
    })
  }
}

export function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
    }
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
}
