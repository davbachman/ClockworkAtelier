import { create } from 'zustand'
import {
  BASE_LAYERS,
  CLOCK_CENTER,
  HAND_LAYER_NAMES,
  MAX_TEETH,
  MIN_TEETH,
} from '../lib/constants'
import { createRandomHandAngles, getCurrentTimeHandAngles } from '../lib/hands'
import { clampTeethCount, getLayerById, subtractPoints } from '../lib/geometry'
import type {
  ClockworkProjectV1,
  DraftGear,
  Gear,
  HandAngles,
  Layer,
  NoticeState,
  Point,
} from '../lib/types'

interface InspectorState {
  gearId: string
  screenX: number
  screenY: number
}

interface CameraState {
  panX: number
  panY: number
}

interface EditorState {
  layers: Layer[]
  gears: Gear[]
  activeLayerId: string | null
  selectedGearId: string | null
  draftGear: DraftGear | null
  toothInput: string
  isPlaying: boolean
  playbackMs: number
  handBaseAngles: HandAngles
  camera: CameraState
  notice: NoticeState | null
  inspector: InspectorState | null
  setToothInput: (value: string) => void
  toggleLayer: (layerId: string) => void
  addLayer: () => void
  startPlacement: (center: Point) => void
  updateDraftCenter: (center: Point) => void
  commitDraft: (center: Point) => void
  cancelDraft: () => void
  startMoveGear: (gearId: string, pointer: Point) => void
  deleteSelection: () => void
  selectGear: (gearId: string | null) => void
  togglePlay: (now?: Date) => void
  setPlaybackMs: (playbackMs: number) => void
  panBy: (delta: Point) => void
  openInspector: (gearId: string, screenX: number, screenY: number) => void
  closeInspector: () => void
  setNotice: (notice: NoticeState | null) => void
  importProject: (project: ClockworkProjectV1) => void
}

function createBaseEditorData() {
  return {
    layers: [...BASE_LAYERS],
    gears: [] as Gear[],
    activeLayerId: 'layer-1' as string | null,
    selectedGearId: null as string | null,
    draftGear: null as DraftGear | null,
    toothInput: '',
    isPlaying: false,
    playbackMs: 0,
    handBaseAngles: createRandomHandAngles(),
    camera: { panX: 0, panY: 0 },
    notice: null as NoticeState | null,
    inspector: null as InspectorState | null,
  }
}

function getNextGearId(gears: Gear[]) {
  const maxId = gears.reduce((maxValue, gear) => {
    const numeric = Number.parseInt(gear.id.replace(/^gear-/, ''), 10)
    return Number.isFinite(numeric) ? Math.max(maxValue, numeric) : maxValue
  }, 0)

  return `gear-${maxId + 1}`
}

function getParsedToothInput(value: string) {
  if (!/^\d+$/.test(value.trim())) {
    return null
  }

  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isFinite(parsedValue) || parsedValue < MIN_TEETH || parsedValue > MAX_TEETH) {
    return null
  }

  return parsedValue
}

function getLayerName(order: number) {
  return HAND_LAYER_NAMES[order] ?? `Layer ${order}`
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...createBaseEditorData(),
  setToothInput: (value) => {
    set({
      toothInput: value.replace(/[^\d]/g, ''),
      notice: null,
    })
  },
  toggleLayer: (layerId) => {
    set((state) => {
      const nextActiveLayerId = state.activeLayerId === layerId ? null : layerId
      const selectedGear =
        state.selectedGearId === null
          ? null
          : state.gears.find((gear) => gear.id === state.selectedGearId) ?? null

      return {
        activeLayerId: nextActiveLayerId,
        selectedGearId:
          selectedGear && selectedGear.layerId === nextActiveLayerId ? selectedGear.id : null,
        inspector: null,
      }
    })
  },
  addLayer: () => {
    set((state) => {
      const nextOrder = state.layers.reduce((maxValue, layer) => Math.max(maxValue, layer.order), 0) + 1
      return {
        layers: [...state.layers, { id: `layer-${nextOrder}`, name: getLayerName(nextOrder), order: nextOrder }],
        notice: null,
      }
    })
  },
  startPlacement: (center) => {
    const state = get()
    const teeth = getParsedToothInput(state.toothInput)

    if (teeth === null || state.activeLayerId === null) {
      set({
        notice: {
          message: `Enter ${MIN_TEETH}-${MAX_TEETH} teeth and activate a layer first.`,
          variant: 'error',
        },
      })
      return
    }

    set({
      draftGear: {
        mode: 'placing',
        gearId: null,
        layerId: state.activeLayerId,
        teeth,
        center,
        offset: { x: 0, y: 0 },
        originalCenter: null,
      },
      inspector: null,
      selectedGearId: null,
      notice: null,
    })
  },
  updateDraftCenter: (center) => {
    set((state) => {
      if (!state.draftGear) {
        return state
      }

      return {
        draftGear: {
          ...state.draftGear,
          center:
            state.draftGear.mode === 'moving'
              ? {
                  x: center.x + state.draftGear.offset.x,
                  y: center.y + state.draftGear.offset.y,
                }
              : center,
        },
      }
    })
  },
  commitDraft: (center) => {
    set((state) => {
      if (!state.draftGear) {
        return state
      }

      if (state.draftGear.mode === 'placing') {
        return {
          gears: [
            ...state.gears,
            {
              id: getNextGearId(state.gears),
              teeth: clampTeethCount(state.draftGear.teeth),
              layerId: state.draftGear.layerId,
              center,
            },
          ],
          draftGear: null,
          notice: null,
        }
      }

      return {
        gears: state.gears.map((gear) =>
          gear.id === state.draftGear?.gearId ? { ...gear, center } : gear,
        ),
        draftGear: null,
        selectedGearId: state.draftGear.gearId,
        notice: null,
      }
    })
  },
  cancelDraft: () => {
    set((state) => ({
      draftGear: null,
      selectedGearId:
        state.draftGear?.mode === 'moving' && state.draftGear.gearId
          ? state.draftGear.gearId
          : state.selectedGearId,
      notice: null,
    }))
  },
  startMoveGear: (gearId, pointer) => {
    set((state) => {
      const gear = state.gears.find((currentGear) => currentGear.id === gearId)
      if (!gear) {
        return state
      }

      const layer = getLayerById(state.layers, gear.layerId)
      if (!layer || state.activeLayerId !== gear.layerId) {
        return state
      }

      return {
        selectedGearId: gear.id,
        inspector: null,
        draftGear: {
          mode: 'moving',
          gearId: gear.id,
          layerId: gear.layerId,
          teeth: gear.teeth,
          center: gear.center,
          offset: subtractPoints(gear.center, pointer),
          originalCenter: gear.center,
        },
      }
    })
  },
  deleteSelection: () => {
    set((state) => {
      if (!state.selectedGearId) {
        return state
      }

      return {
        gears: state.gears.filter((gear) => gear.id !== state.selectedGearId),
        selectedGearId: null,
        draftGear:
          state.draftGear?.gearId === state.selectedGearId ? null : state.draftGear,
        inspector:
          state.inspector?.gearId === state.selectedGearId ? null : state.inspector,
      }
    })
  },
  selectGear: (gearId) => {
    set({
      selectedGearId: gearId,
      inspector: null,
    })
  },
  togglePlay: (now = new Date()) => {
    set((state) =>
      state.isPlaying
        ? {
            isPlaying: false,
            inspector: null,
          }
        : {
            isPlaying: true,
            playbackMs: 0,
            handBaseAngles: getCurrentTimeHandAngles(now),
            inspector: null,
          },
    )
  },
  setPlaybackMs: (playbackMs) => {
    set({ playbackMs })
  },
  panBy: (delta) => {
    set((state) => ({
      camera: {
        panX: state.camera.panX - delta.x,
        panY: state.camera.panY - delta.y,
      },
    }))
  },
  openInspector: (gearId, screenX, screenY) => {
    set({
      inspector: { gearId, screenX, screenY },
      selectedGearId: gearId,
    })
  },
  closeInspector: () => {
    set({ inspector: null })
  },
  setNotice: (notice) => {
    set({ notice })
  },
  importProject: (project) => {
    set({
      layers: project.layers as typeof BASE_LAYERS,
      gears: project.gears,
      activeLayerId: project.layers[0]?.id ?? null,
      selectedGearId: null,
      draftGear: null,
      isPlaying: false,
      playbackMs: 0,
      handBaseAngles: createRandomHandAngles(),
      camera: project.camera,
      inspector: null,
      notice: {
        message: 'Project imported.',
        variant: 'success',
      },
    })
  },
}))

export function resetEditorStore() {
  useEditorStore.setState(createBaseEditorData())
}

export function getEditorProjectSnapshot() {
  const state = useEditorStore.getState()

  return {
    version: 1 as const,
    layers: state.layers,
    gears: state.gears,
    camera: state.camera,
  }
}

export function getDefaultPlacementPoint() {
  return {
    x: CLOCK_CENTER.x + 140,
    y: CLOCK_CENTER.y,
  }
}
