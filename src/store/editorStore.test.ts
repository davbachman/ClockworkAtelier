import { parseProjectJson } from '../lib/project'
import { WORKSPACE_CENTER } from '../lib/constants'
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

  it('starts with the clock camera centered on the main hand arbor', () => {
    const state = useEditorStore.getState()

    expect(state.workspaces.clock.camera).toEqual({
      panX: WORKSPACE_CENTER.x,
      panY: WORKSPACE_CENTER.y,
    })
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

  it('undoes deleting a selected gear', () => {
    useEditorStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        clock: {
          ...state.workspaces.clock,
          gears: [
            {
              id: 'gear-1',
              teeth: 36,
              layerId: 'layer-1',
              center: { x: -140, y: 0 },
            },
          ],
          selectedGearId: 'gear-1',
        },
      },
    }))

    useEditorStore.getState().deleteSelection()
    expect(useEditorStore.getState().workspaces.clock.gears).toHaveLength(0)

    useEditorStore.getState().undo()

    const state = useEditorStore.getState()
    expect(state.workspaces.clock.gears).toEqual([
      {
        id: 'gear-1',
        teeth: 36,
        layerId: 'layer-1',
        center: { x: -140, y: 0 },
      },
    ])
    expect(state.workspaces.clock.selectedGearId).toBeNull()
  })

  it('undoes importing a project', () => {
    useEditorStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        clock: {
          ...state.workspaces.clock,
          gears: [
            {
              id: 'gear-1',
              teeth: 24,
              layerId: 'layer-2',
              center: { x: 10, y: 20 },
            },
          ],
        },
      },
    }))

    const project = parseProjectJson(
      JSON.stringify({
        version: 2,
        activeMode: 'orrery',
        clock: {
          layers: [
            { id: 'layer-1', name: 'Second Hand Layer', order: 1 },
            { id: 'layer-2', name: 'Minute Hand Layer', order: 2 },
            { id: 'layer-3', name: 'Hour Hand Layer', order: 3 },
          ],
          gears: [],
          camera: { panX: 0, panY: 0 },
        },
        orrery: {
          layers: [
            { id: 'layer-1', name: 'Mercury Layer', order: 1 },
            { id: 'layer-2', name: 'Venus Layer', order: 2 },
            { id: 'layer-3', name: 'Earth Layer', order: 3 },
            { id: 'layer-4', name: 'Mars Layer', order: 4 },
            { id: 'layer-5', name: 'Jupiter Layer', order: 5 },
            { id: 'layer-6', name: 'Saturn Layer', order: 6 },
          ],
          gears: [
            {
              id: 'gear-9',
              teeth: 52,
              layerId: 'layer-4',
              center: { x: 60, y: -40 },
            },
          ],
          camera: { panX: 18, panY: -12 },
        },
      }),
    )

    useEditorStore.getState().importProject(project)
    expect(useEditorStore.getState().activeMode).toBe('orrery')

    useEditorStore.getState().undo()

    const state = useEditorStore.getState()
    expect(state.activeMode).toBe('clock')
    expect(state.workspaces.clock.gears).toEqual([
      {
        id: 'gear-1',
        teeth: 24,
        layerId: 'layer-2',
        center: { x: 10, y: 20 },
      },
    ])
    expect(state.workspaces.orrery.gears).toHaveLength(0)
  })

  it('loads the selected gear tooth count into the input', () => {
    useEditorStore.setState((state) => ({
      ...state,
      workspaces: {
        ...state.workspaces,
        clock: {
          ...state.workspaces.clock,
          gears: [
            {
              id: 'gear-1',
              teeth: 40,
              layerId: 'layer-2',
              center: { x: 12, y: 24 },
            },
          ],
          selectedGearId: 'gear-1',
        },
      },
    }))

    useEditorStore.getState().selectGear('gear-1')

    const state = useEditorStore.getState()
    expect(state.workspaces.clock.selectedGearId).toBe('gear-1')
    expect(state.workspaces.clock.toothInput).toBe('40')
  })
})
