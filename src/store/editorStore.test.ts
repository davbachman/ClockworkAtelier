import { parseProjectJson } from '../lib/project'
import { resetEditorStore, useEditorStore } from './editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetEditorStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes clock hand positions to the current time when play is activated', () => {
    vi.setSystemTime(new Date(2026, 3, 5, 3, 15, 30, 0))

    useEditorStore.getState().togglePlay()

    const state = useEditorStore.getState()
    expect(state.workspaces.clock.isPlaying).toBe(true)
    expect(state.workspaces.clock.playbackMs).toBe(0)
    expect(state.workspaces.clock.baseAngles.secondArbor).toBeCloseTo(180, 6)
    expect(state.workspaces.clock.baseAngles.minuteArbor).toBeCloseTo(93, 6)
    expect(state.workspaces.clock.baseAngles.hourArbor).toBeCloseTo(97.75, 6)
    expect(state.workspaces.clock.baseAngles.amPmArbor).toBeCloseTo(97.75, 6)
    expect(state.workspaces.clock.baseAngles.dayArbor).toBeCloseTo(6.9821, 4)
  })

  it('switches modes while preserving workspace builds and clearing transient UI state', () => {
    useEditorStore.setState((state) => ({
      ...state,
      workspaces: {
        clock: {
          ...state.workspaces.clock,
          gears: [
            {
              id: 'gear-1',
              teeth: 40,
              layerId: 'layer-2',
              center: { x: 20, y: 30 },
            },
          ],
          activeLayerId: 'layer-2',
          selectedGearId: 'gear-1',
          draftGear: {
            mode: 'moving',
            gearId: 'gear-1',
            layerId: 'layer-2',
            teeth: 40,
            center: { x: 20, y: 30 },
            offset: { x: 0, y: 0 },
            originalCenter: { x: 20, y: 30 },
          },
          isPlaying: true,
          playbackMs: 2400,
          inspector: { gearId: 'gear-1', screenX: 10, screenY: 10 },
        },
        orrery: {
          ...state.workspaces.orrery,
          gears: [
            {
              id: 'gear-1',
              teeth: 24,
              layerId: 'layer-4',
              center: { x: -50, y: 70 },
            },
          ],
          activeLayerId: 'layer-4',
          selectedGearId: 'gear-1',
          planetDialog: { outputId: 'earthArbor', screenX: 40, screenY: 50 },
        },
      },
    }))

    useEditorStore.getState().switchMode()

    const state = useEditorStore.getState()
    expect(state.activeMode).toBe('orrery')
    expect(state.workspaces.clock.gears).toHaveLength(1)
    expect(state.workspaces.clock.activeLayerId).toBe('layer-2')
    expect(state.workspaces.clock.draftGear).toBeNull()
    expect(state.workspaces.clock.isPlaying).toBe(false)
    expect(state.workspaces.clock.inspector).toBeNull()
    expect(state.workspaces.orrery.gears).toHaveLength(1)
    expect(state.workspaces.orrery.activeLayerId).toBe('layer-4')
    expect(state.workspaces.orrery.selectedGearId).toBeNull()
    expect(state.workspaces.orrery.planetDialog).toBeNull()
  })

  it('imports legacy v1 clock projects into the clock workspace and creates a blank orrery workspace', () => {
    const project = parseProjectJson(
      JSON.stringify({
        version: 1,
        layers: [
          { id: 'layer-1', name: 'Second Hand Layer', order: 1 },
          { id: 'layer-2', name: 'Minute Hand Layer', order: 2 },
          { id: 'layer-3', name: 'Hour Hand Layer', order: 3 },
        ],
        gears: [
          {
            id: 'gear-1',
            teeth: 36,
            layerId: 'layer-1',
            center: { x: -140, y: 0 },
          },
        ],
        camera: { panX: 24, panY: -18 },
      }),
    )

    useEditorStore.getState().importProject(project)

    const state = useEditorStore.getState()
    expect(state.activeMode).toBe('clock')
    expect(state.workspaces.clock.gears).toHaveLength(1)
    expect(state.workspaces.clock.camera).toEqual({ panX: 24, panY: -18 })
    expect(state.workspaces.orrery.layers).toHaveLength(6)
    expect(state.workspaces.orrery.gears).toHaveLength(0)
    expect(state.workspaces.clock.notice?.message).toBe('Project imported.')
  })
})
