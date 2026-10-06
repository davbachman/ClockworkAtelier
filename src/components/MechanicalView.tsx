import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Maximize, Orbit, ZoomIn, ZoomOut } from 'lucide-react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createMechanicalGear, createMechanicalModel, disposeObject, gearHeight, setMechanicalLayerFocus } from '../lib/mechanicalScene'
import type { MechanicalModel } from '../lib/mechanicalScene'
import { fitMechanicalCamera } from '../lib/mechanicalCamera'
import { getAnimatedAngle } from '../lib/hands'
import { gearsMesh, getMeshingRotation } from '../lib/gearPhases'
import { resolvePlacement, getOuterRadius } from '../lib/geometry'
import { MOTOR_CENTER } from '../lib/constants'
import { useEditorStore } from '../store/editorStore'
import type { WorkspaceState } from '../store/editorStore'
import type { EditorMode, Gear, Layer, OutputTarget, TrainAnalysis } from '../lib/types'

interface Props {
  mode: EditorMode
  gears: Gear[]
  layers: Layer[]
  outputs: OutputTarget[]
  analysis: TrainAnalysis
  workspace: WorkspaceState
  onFallback: () => void
}

interface Runtime {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  model: MechanicalModel | null
  draft: THREE.Group | null
  draftTeeth: number | null
  fit: () => void
}

export default function MechanicalView(props: Props) {
  const { mode, gears, layers, outputs } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtime = useRef<Runtime | null>(null)
  const [orbit, setOrbit] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useEffectEvent(() => ({ ...props, orbit }))

  const animate = useEffectEvent(() => {
    const view = runtime.current
    if (!view?.model) return
    const { workspace, analysis } = props
    view.controls.update()
    for (const gear of props.gears) {
      const object = view.model.gears.get(gear.id)!
      object.rotation.z = (view.model.gearPhases.get(gear.id) ?? 0)
        - (analysis.computedByGearId[gear.id]?.rpm ?? 0) * Math.PI * 2 * workspace.playbackMs / 60000
      object.visible = workspace.draftGear?.gearId !== gear.id
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.emissive.setHex(workspace.selectedGearId === gear.id ? 0x355e36 : 0)
        }
      })
    }
    for (const output of props.outputs) {
      const group = view.model.outputs.get(output.id)!
      group.rotation.z = -getAnimatedAngle(workspace.baseAngles[output.id] ?? 0,
        analysis.outputStates[output.id]?.rpm ?? null, workspace.playbackMs) * Math.PI / 180
      // Keep the engraved planet faces upright as the arms rotate.
      group.children.forEach((child) => { if (child.userData.outputId) child.rotation.z = -group.rotation.z })
    }
    const draft = workspace.draftGear
    if (draft) {
      const placement = resolvePlacement({ mode, draftGear: draft, gears: props.gears, layers: props.layers, excludeGearId: draft.gearId })
      if (view.draftTeeth !== draft.teeth) {
        if (view.draft) { view.scene.remove(view.draft); disposeObject(view.draft) }
        view.draft = createMechanicalGear(draft.teeth)
        view.scene.add(view.draft)
        view.draftTeeth = draft.teeth
      }
      const order = props.layers.find((layer) => layer.id === draft.layerId)?.order ?? 1
      view.draft!.position.set(placement.center.x, -placement.center.y, gearHeight(order))
      const placedDraft = { ...draft, center: placement.center }
      const neighbor = props.gears.find((gear) => gear.id !== draft.gearId && gearsMesh(gear, placedDraft))
      view.draft!.rotation.z = neighbor
        ? getMeshingRotation(neighbor, view.model.gears.get(neighbor.id)!.rotation.z, placedDraft)
        : draft.gearId ? view.model.gears.get(draft.gearId)?.rotation.z ?? 0 : 0
      const invalid = placement.state === 'invalidLoop' || placement.state === 'invalidOverlap'
      view.draft!.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.color.setHex(invalid ? 0xbb5141 : 0x84ad7c)
        }
      })
    } else if (view.draft) {
      view.scene.remove(view.draft)
      disposeObject(view.draft)
      view.draft = null
      view.draftTeeth = null
    }
    view.renderer.render(view.scene, view.camera)
  })

  useEffect(() => {
    const canvas = canvasRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    } catch {
      queueMicrotask(() => setFailed(true))
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1
    const scene = new THREE.Scene()
    const dark = mode === 'orrery'
    scene.background = new THREE.Color(dark ? 0x10151d : 0xf1eadc)
    const camera = new THREE.PerspectiveCamera(40, 1, 1, 10000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, canvas)
    controls.enableDamping = false
    controls.minPolarAngle = 0.05
    controls.maxPolarAngle = Math.PI / 2 - 0.12
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
    controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    scene.add(new THREE.HemisphereLight(0xeaf2ff, dark ? 0x3c3b37 : 0x9c9073, 1.8))
    const light = new THREE.DirectionalLight(0xffedce, 2.5)
    light.position.set(-250, 300, 1600)
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    Object.assign(light.shadow.camera, { left: -1100, right: 1100, top: 1100, bottom: -1100, far: 3000 })
    light.shadow.bias = -0.0002
    light.shadow.normalBias = 1
    light.shadow.radius = 4
    light.shadow.intensity = 0.55
    scene.add(light)
    const fill = new THREE.DirectionalLight(0xc5d9f4, 1.2)
    fill.position.set(600, -300, 500)
    scene.add(fill)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000),
      new THREE.MeshBasicMaterial({ color: dark ? 0x10151d : 0xeee6d5, toneMapped: false }))
    floor.position.z = -3
    floor.receiveShadow = true
    scene.add(floor)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(10000, 10000), new THREE.ShadowMaterial({ opacity: 0.35 }))
    shadow.position.z = -2.5
    shadow.receiveShadow = true
    scene.add(shadow)
    const grid = new THREE.GridHelper(8000, 200, dark ? 0x1e2630 : 0xcac2b3, dark ? 0x1b232c : 0xd8cfbd)
    grid.rotation.x = Math.PI / 2
    grid.position.z = -2
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
      material.transparent = true
      material.opacity = 0.45
      material.toneMapped = false
    }
    scene.add(grid)

    const fit = () => {
      const { gears: currentGears, layers: currentLayers, outputs: currentOutputs } = latest()
      let left = -380, right = 380, top = -380, bottom = 380
      left = Math.min(left, MOTOR_CENTER.x - 35)
      for (const gear of currentGears) {
        const radius = getOuterRadius(gear.teeth) + 20
        left = Math.min(left, gear.center.x - radius); right = Math.max(right, gear.center.x + radius)
        top = Math.min(top, gear.center.y - radius); bottom = Math.max(bottom, gear.center.y + radius)
      }
      for (const output of currentOutputs) {
        if (!output.orbitRadius) continue
        const radius = output.orbitRadius + 40
        left = Math.min(left, output.center.x - radius); right = Math.max(right, output.center.x + radius)
        top = Math.min(top, output.center.y - radius); bottom = Math.max(bottom, output.center.y + radius)
      }
      const height = Math.max(12, ...currentLayers.map((layer) => gearHeight(layer.order))) + 80
      const { center, distance } = fitMechanicalCamera(camera, new THREE.Box3(
        new THREE.Vector3(left, -bottom, 0), new THREE.Vector3(right, -top, height),
      ))
      controls.target.copy(center)
      controls.minDistance = distance / 5
      controls.maxDistance = distance / 0.3
      controls.update()
    }
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      fit()
    }
    runtime.current = { scene, camera, renderer, controls, model: null, draft: null, draftTeeth: null, fit }
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    renderer.setAnimationLoop(animate)

    const raycaster = new THREE.Raycaster()
    function ray(event: PointerEvent) {
      const box = canvas.getBoundingClientRect()
      raycaster.setFromCamera(new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1,
        -(event.clientY - box.top) / box.height * 2 + 1), camera)
      return raycaster
    }
    function inside(event: PointerEvent) {
      const box = canvas.getBoundingClientRect()
      return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
    }
    function point(event: PointerEvent) {
      const { workspace, layers: currentLayers } = latest()
      const layerId = workspace.draftGear?.layerId ?? workspace.activeLayerId
      const height = gearHeight(currentLayers.find((layer) => layer.id === layerId)?.order ?? 1) + 11
      const intersection = ray(event).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -height), new THREE.Vector3())
      return intersection ? { x: intersection.x, y: -intersection.y } : null
    }
    let interaction: { id: number; x: number; y: number; gearId: string | null; moved: boolean } | null = null
    const down = (event: PointerEvent) => {
      if (event.button !== 0) return
      const state = latest()
      if (state.orbit && !state.workspace.draftGear) return
      const store = useEditorStore.getState()
      const location = point(event)
      if (!location) return
      if (state.workspace.draftGear?.mode === 'placing') {
        controls.enabled = false
        store.updateDraftCenter(location)
        interaction = { id: event.pointerId, x: event.clientX, y: event.clientY, gearId: null, moved: true }
        event.stopImmediatePropagation()
        return
      }
      const model = runtime.current?.model
      if (!model) return
      const picks = state.gears.filter((gear) => gear.layerId === state.workspace.activeLayerId).map((gear) => model.gears.get(gear.id)!)
      const hit = ray(event).intersectObjects(picks, true)[0]
      if (hit) {
        const gearId = hit.object.userData.gearId as string
        store.startMoveGear(gearId, location)
        controls.enabled = false
        interaction = { id: event.pointerId, x: event.clientX, y: event.clientY, gearId, moved: false }
        event.stopImmediatePropagation()
      } else {
        const planet = ray(event).intersectObjects(model.planets)[0]
        if (planet && !state.workspace.activeLayerId) {
          store.openPlanetDialog(planet.object.userData.outputId, event.clientX, event.clientY)
        } else store.selectGear(null)
      }
    }
    const move = (event: PointerEvent) => {
      const store = useEditorStore.getState()
      const draft = store.workspaces[mode].draftGear
      if (!draft || (!inside(event) && !interaction)) return
      if (interaction && interaction.id !== event.pointerId) return
      if (interaction && Math.hypot(event.clientX - interaction.x, event.clientY - interaction.y) > 4) interaction.moved = true
      if (draft.mode === 'moving' && !interaction?.moved) return
      const location = point(event)
      if (location) store.updateDraftCenter(location)
    }
    const up = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (interaction && interaction.id !== event.pointerId) return
      const store = useEditorStore.getState()
      const draft = store.workspaces[mode].draftGear
      controls.enabled = true
      if (!draft) { interaction = null; return }
      if (!interaction && (draft.mode !== 'placing' || !inside(event))) return
      if (interaction?.gearId && !interaction.moved) {
        store.cancelDraft()
        store.openInspector(interaction.gearId, event.clientX, event.clientY)
      } else if (inside(event)) {
        const current = latest()
        const location = point(event)
        const currentDraft = location ? { ...draft, center: { x: location.x + draft.offset.x, y: location.y + draft.offset.y } } : draft
        const placement = resolvePlacement({ mode, draftGear: currentDraft, gears: current.gears, layers: current.layers, excludeGearId: draft.gearId })
        if (placement.state !== 'invalidOverlap' && placement.state !== 'invalidLoop') store.commitDraft(placement.center)
        else store.cancelDraft()
      } else store.cancelDraft()
      interaction = null
    }
    const cancel = () => { interaction = null; controls.enabled = true; useEditorStore.getState().cancelDraft() }
    const lost = (event: Event) => { event.preventDefault(); setFailed(true) }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('webglcontextlost', lost)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      observer.disconnect()
      renderer.setAnimationLoop(null)
      controls.dispose()
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('webglcontextlost', lost)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      runtime.current?.model?.textures.forEach((texture) => texture.dispose())
      disposeObject(scene)
      light.shadow.map?.dispose()
      renderer.dispose()
      runtime.current = null
    }
  }, [mode])

  useEffect(() => {
    const view = runtime.current
    if (!view) return
    if (view.model) {
      view.scene.remove(view.model.root)
      disposeObject(view.model.root)
      view.model.textures.forEach((texture) => texture.dispose())
    }
    view.model = createMechanicalModel(mode, gears, layers, outputs)
    view.scene.add(view.model.root)
  }, [mode, gears, layers, outputs])

  useEffect(() => {
    const model = runtime.current?.model
    if (model) setMechanicalLayerFocus(model, props.workspace.activeLayerId)
  }, [mode, gears, layers, outputs, props.workspace.activeLayerId])

  useEffect(() => {
    const controls = runtime.current?.controls
    if (!controls) return
    Object.assign(controls.mouseButtons, { LEFT: orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN })
    Object.assign(controls.touches, { ONE: orbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN })
  }, [orbit, mode])

  function zoom(factor: number) {
    const view = runtime.current
    if (!view) return
    const offset = view.camera.position.clone().sub(view.controls.target)
    const distance = THREE.MathUtils.clamp(offset.length() / factor,
      view.controls.minDistance, view.controls.maxDistance)
    view.camera.position.copy(view.controls.target).add(offset.setLength(distance))
    view.controls.update()
  }

  return <div className="mechanical-view">
    <canvas ref={canvasRef} className="mechanical-canvas" data-testid="workspace-3d" aria-label="Three-dimensional mechanism" />
    {failed ? <div className="view-error" role="alert">
      <p>3D is unavailable in this browser.</p>
      <button className="sidebar-button" onClick={props.onFallback}>Return to flat view</button>
    </div> : <div className="scene-tools">
      <button type="button" title="Rotate view" aria-label="Rotate view" aria-pressed={orbit} onClick={() => setOrbit(!orbit)}><Orbit size={18} /></button>
      <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoom(1.2)}><ZoomIn size={18} /></button>
      <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}><ZoomOut size={18} /></button>
      <button type="button" title="Fit mechanism" aria-label="Fit mechanism" onClick={() => runtime.current?.fit()}><Maximize size={18} /></button>
    </div>}
  </div>
}
