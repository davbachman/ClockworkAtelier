import { create } from 'zustand'
import {
  MAX_TEETH,
  MIN_TEETH,
  WORKSPACE_CENTER,
  getLayerName,
  getModeConfig,
  getOutputById,
} from '../lib/constants'
import { createRandomAngles, createRandomHandAngles, getCurrentTimeHandAngles } from '../lib/hands'
import { buildProjectSnapshot } from '../lib/project'
import { clampTeethCount, getLayerById, subtractPoints } from '../lib/geometry'
import type {
  AtelierProjectV2,
  BaseAngleMap,
  DraftGear,
  EditorMode,
  Gear,
  Layer,
  NoticeState,
  Point,
} from '../lib/types'

interface InspectorState {
  gearId: string
  screenX: number
  screenY: number
}

interface PlanetDialogState {
  outputId: string
  screenX: number
  screenY: number
}

interface CameraState {
  panX: number
  panY: number
}

export interface WorkspaceState {
  layers: Layer[]
  gears: Gear[]
  activeLayerId: string | null
  selectedGearId: string | null
  draftGear: DraftGear | null
  toothInput: string
  isPlaying: boolean
  playbackMs: number
  baseAngles: BaseAngleMap
  camera: CameraState
  notice: NoticeState | null
  inspector: InspectorState | null
  planetDialog: PlanetDialogState | null
}

interface EditorState {
  activeMode: EditorMode
  workspaces: Record<EditorMode, WorkspaceState>
  undoStack: AtelierProjectV2[]
  setToothInput: (value: string) => void
  switchMode: () => void
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
  openPlanetDialog: (outputId: string, screenX: number, screenY: number) => void
  closePlanetDialog: () => void
  closeOverlays: () => void
  undo: () => void
  setNotice: (notice: NoticeState | null) => void
  importProject: (project: AtelierProjectV2) => void
}

function createInitialBaseAngles(mode: EditorMode) {
  if (mode === 'clock') {
    return createRandomHandAngles()
  }

  return createRandomAngles(getModeConfig(mode).outputs.map((output) => output.id))
}

function createInitialCamera(mode: EditorMode): CameraState {
  const focalOutputId = mode === 'clock' ? 'hourArbor' : 'earthArbor'
  const center = getOutputById(mode, focalOutputId)?.center ?? WORKSPACE_CENTER

  return {
    panX: center.x,
    panY: center.y,
  }
}

function createWorkspaceData(mode: EditorMode, overrides?: Partial<Pick<WorkspaceState, 'layers' | 'gears' | 'camera'>>): WorkspaceState {
  const layers = overrides?.layers
    ? [...overrides.layers].sort((layerA, layerB) => layerA.order - layerB.order)
    : getModeConfig(mode).layers.map((layer) => ({ ...layer }))

  return {
    layers,
    gears: overrides?.gears ?? [],
    activeLayerId: layers[0]?.id ?? null,
    selectedGearId: null,
    draftGear: null,
    toothInput: '',
    isPlaying: false,
    playbackMs: 0,
    baseAngles: createInitialBaseAngles(mode),
    camera: overrides?.camera ?? createInitialCamera(mode),
    notice: null,
    inspector: null,
    planetDialog: null,
  }
}

function createBaseEditorData() {
  return {
    activeMode: 'clock' as EditorMode,
    undoStack: [] as AtelierProjectV2[],
    workspaces: {
      clock: createWorkspaceData('clock'),
      orrery: createWorkspaceData('orrery'),
    },
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

function sanitizeWorkspaceForModeSwitch(workspace: WorkspaceState) {
  return {
    ...workspace,
    draftGear: null,
    selectedGearId: null,
    isPlaying: false,
    playbackMs: 0,
    inspector: null,
    planetDialog: null,
    notice: null,
  }
}

function updateActiveWorkspace(
  state: EditorState,
  updater: (workspace: WorkspaceState, mode: EditorMode) => Partial<WorkspaceState> | WorkspaceState,
) {
  const mode = state.activeMode
  const currentWorkspace = state.workspaces[mode]
  const nextWorkspace = updater(currentWorkspace, mode)

  return {
    workspaces: {
      ...state.workspaces,
      [mode]: {
        ...currentWorkspace,
        ...nextWorkspace,
      },
    },
  }
}

function createUndoSnapshot(state: Pick<EditorState, 'activeMode' | 'workspaces'>) {
  return buildProjectSnapshot(state.activeMode, {
    clock: state.workspaces.clock,
    orrery: state.workspaces.orrery,
  })
}

function pushUndoSnapshot(state: EditorState) {
  return [...state.undoStack, createUndoSnapshot(state)]
}

function restoreProjectSnapshot(project: AtelierProjectV2) {
  return {
    activeMode: project.activeMode,
    workspaces: {
      clock: createWorkspaceData('clock', project.clock),
      orrery: createWorkspaceData('orrery', project.orrery),
    },
  }
}

export const useEditorStore = create<EditorState>((set, get) => ({
  ...createBaseEditorData(),
  setToothInput: (value) => {
    set((state) =>
      updateActiveWorkspace(state, () => ({
        toothInput: value.replace(/[^\d]/g, ''),
        notice: null,
      })),
    )
  },
  switchMode: () => {
    set((state) => {
      const nextMode: EditorMode = state.activeMode === 'clock' ? 'orrery' : 'clock'

      return {
        undoStack: pushUndoSnapshot(state),
        activeMode: nextMode,
        workspaces: {
          clock: sanitizeWorkspaceForModeSwitch(state.workspaces.clock),
          orrery: sanitizeWorkspaceForModeSwitch(state.workspaces.orrery),
        },
      }
    })
  },
  toggleLayer: (layerId) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => {
        const nextActiveLayerId = workspace.activeLayerId === layerId ? null : layerId
        const selectedGear =
          workspace.selectedGearId === null
            ? null
            : workspace.gears.find((gear) => gear.id === workspace.selectedGearId) ?? null

        return {
          activeLayerId: nextActiveLayerId,
          selectedGearId:
            selectedGear && selectedGear.layerId === nextActiveLayerId ? selectedGear.id : null,
          inspector: null,
          planetDialog: null,
        }
      }),
    )
  },
  addLayer: () => {
    set((state) => {
      const nextState = updateActiveWorkspace(state, (workspace, mode) => {
        if (!getModeConfig(mode).allowAddLayer) {
          return workspace
        }

        const nextOrder =
          workspace.layers.reduce((maxValue, layer) => Math.max(maxValue, layer.order), 0) + 1

        return {
          layers: [
            ...workspace.layers,
            { id: `layer-${nextOrder}`, name: getLayerName(mode, nextOrder), order: nextOrder },
          ],
          notice: null,
        }
      })

      return {
        ...nextState,
        undoStack: pushUndoSnapshot(state),
      }
    })
  },
  startPlacement: (center) => {
    const state = get()
    const workspace = state.workspaces[state.activeMode]
    const teeth = getParsedToothInput(workspace.toothInput)

    if (teeth === null || workspace.activeLayerId === null) {
      set(
        updateActiveWorkspace(state, () => ({
          notice: {
            message: `Enter ${MIN_TEETH}-${MAX_TEETH} teeth and activate a layer first.`,
            variant: 'error',
          },
        })),
      )
      return
    }

    set(
      {
        ...updateActiveWorkspace(state, () => ({
          draftGear: {
            mode: 'placing',
            gearId: null,
            layerId: workspace.activeLayerId!,
            teeth,
            center,
            offset: { x: 0, y: 0 },
            originalCenter: null,
          },
          inspector: null,
          planetDialog: null,
          selectedGearId: null,
          notice: null,
        })),
        undoStack: pushUndoSnapshot(state),
      },
    )
  },
  updateDraftCenter: (center) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => {
        if (!workspace.draftGear) {
          return workspace
        }

        return {
          draftGear: {
            ...workspace.draftGear,
            center:
              workspace.draftGear.mode === 'moving'
                ? {
                    x: center.x + workspace.draftGear.offset.x,
                    y: center.y + workspace.draftGear.offset.y,
                  }
                : center,
          },
        }
      }),
    )
  },
  commitDraft: (center) => {
    set((state) => {
      const nextState = updateActiveWorkspace(state, (workspace) => {
        if (!workspace.draftGear) {
          return workspace
        }

        if (workspace.draftGear.mode === 'placing') {
          return {
            gears: [
              ...workspace.gears,
              {
                id: getNextGearId(workspace.gears),
                teeth: clampTeethCount(workspace.draftGear.teeth),
                layerId: workspace.draftGear.layerId,
                center,
              },
            ],
            draftGear: null,
            notice: null,
          }
        }

        return {
          gears: workspace.gears.map((gear) =>
            gear.id === workspace.draftGear?.gearId ? { ...gear, center } : gear,
          ),
          draftGear: null,
          selectedGearId: workspace.draftGear.gearId,
          notice: null,
        }
      })

      return {
        ...nextState,
        undoStack: pushUndoSnapshot(state),
      }
    })
  },
  cancelDraft: () => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => ({
        draftGear: null,
        selectedGearId:
          workspace.draftGear?.mode === 'moving' && workspace.draftGear.gearId
            ? workspace.draftGear.gearId
            : workspace.selectedGearId,
        notice: null,
      })),
    )
  },
  startMoveGear: (gearId, pointer) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => {
        const gear = workspace.gears.find((currentGear) => currentGear.id === gearId)
        if (!gear) {
          return workspace
        }

        const layer = getLayerById(workspace.layers, gear.layerId)
        if (!layer || workspace.activeLayerId !== gear.layerId) {
          return workspace
        }

        return {
          selectedGearId: gear.id,
          toothInput: String(gear.teeth),
          inspector: null,
          planetDialog: null,
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
      }),
    )
  },
  deleteSelection: () => {
    set((state) => {
      const nextState = updateActiveWorkspace(state, (workspace) => {
        if (!workspace.selectedGearId) {
          return workspace
        }

        return {
          gears: workspace.gears.filter((gear) => gear.id !== workspace.selectedGearId),
          selectedGearId: null,
          draftGear:
            workspace.draftGear?.gearId === workspace.selectedGearId ? null : workspace.draftGear,
          inspector:
            workspace.inspector?.gearId === workspace.selectedGearId ? null : workspace.inspector,
        }
      })

      return {
        ...nextState,
        undoStack: pushUndoSnapshot(state),
      }
    })
  },
  selectGear: (gearId) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => {
        const selectedGear =
          gearId === null ? null : workspace.gears.find((gear) => gear.id === gearId) ?? null

        return {
          selectedGearId: gearId,
          toothInput: selectedGear ? String(selectedGear.teeth) : workspace.toothInput,
          inspector: null,
          planetDialog: null,
        }
      }),
    )
  },
  togglePlay: (now = new Date()) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace, mode) =>
        workspace.isPlaying
          ? {
              isPlaying: false,
              inspector: null,
              planetDialog: null,
            }
          : {
              isPlaying: true,
              playbackMs: 0,
              baseAngles:
                mode === 'clock'
                  ? getCurrentTimeHandAngles(now)
                  : workspace.baseAngles,
              inspector: null,
              planetDialog: null,
            },
      ),
    )
  },
  setPlaybackMs: (playbackMs) => {
    set((state) => updateActiveWorkspace(state, () => ({ playbackMs })))
  },
  panBy: (delta) => {
    set((state) =>
      updateActiveWorkspace(state, (workspace) => ({
        camera: {
          panX: workspace.camera.panX - delta.x,
          panY: workspace.camera.panY - delta.y,
        },
      })),
    )
  },
  openInspector: (gearId, screenX, screenY) => {
    set((state) =>
      updateActiveWorkspace(state, () => ({
        inspector: { gearId, screenX, screenY },
        planetDialog: null,
        selectedGearId: gearId,
        toothInput:
          state.workspaces[state.activeMode].gears.find((gear) => gear.id === gearId)?.teeth.toString() ??
          state.workspaces[state.activeMode].toothInput,
      })),
    )
  },
  closeInspector: () => {
    set((state) => updateActiveWorkspace(state, () => ({ inspector: null })))
  },
  openPlanetDialog: (outputId, screenX, screenY) => {
    set((state) =>
      updateActiveWorkspace(state, () => ({
        planetDialog: { outputId, screenX, screenY },
        inspector: null,
      })),
    )
  },
  closePlanetDialog: () => {
    set((state) => updateActiveWorkspace(state, () => ({ planetDialog: null })))
  },
  closeOverlays: () => {
    set((state) =>
      updateActiveWorkspace(state, () => ({
        inspector: null,
        planetDialog: null,
      })),
    )
  },
  undo: () => {
    set((state) => {
      const previous = state.undoStack.at(-1)

      if (!previous) {
        return state
      }

      return {
        ...restoreProjectSnapshot(previous),
        undoStack: state.undoStack.slice(0, -1),
      }
    })
  },
  setNotice: (notice) => {
    set((state) => updateActiveWorkspace(state, () => ({ notice })))
  },
  importProject: (project) => {
    set((state) => ({
      ...restoreProjectSnapshot(project),
      undoStack: pushUndoSnapshot(state),
    }))
    set((state) =>
      updateActiveWorkspace(state, () => ({
        notice: {
          message: 'Project imported.',
          variant: 'success',
        },
      })),
    )
  },
}))

export function resetEditorStore() {
  useEditorStore.setState(createBaseEditorData())
}

export function getEditorProjectSnapshot() {
  const state = useEditorStore.getState()

  return {
    version: 2 as const,
    activeMode: state.activeMode,
    clock: {
      layers: state.workspaces.clock.layers,
      gears: state.workspaces.clock.gears,
      camera: state.workspaces.clock.camera,
    },
    orrery: {
      layers: state.workspaces.orrery.layers,
      gears: state.workspaces.orrery.gears,
      camera: state.workspaces.orrery.camera,
    },
  }
}

export function getDefaultPlacementPoint() {
  return {
    x: WORKSPACE_CENTER.x + 140,
    y: WORKSPACE_CENTER.y,
  }
}
