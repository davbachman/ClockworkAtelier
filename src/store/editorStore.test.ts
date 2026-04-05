import { resetEditorStore, useEditorStore } from './editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes hand positions to the current time when play is activated', () => {
    vi.setSystemTime(new Date(2026, 3, 5, 3, 15, 30, 0))
    resetEditorStore()

    useEditorStore.getState().togglePlay()

    const state = useEditorStore.getState()
    expect(state.isPlaying).toBe(true)
    expect(state.playbackMs).toBe(0)
    expect(state.handBaseAngles.secondArbor).toBeCloseTo(180, 6)
    expect(state.handBaseAngles.minuteArbor).toBeCloseTo(93, 6)
    expect(state.handBaseAngles.hourArbor).toBeCloseTo(97.75, 6)
  })

  it('re-syncs all hands to the current time on each new play activation', () => {
    resetEditorStore()

    vi.setSystemTime(new Date(2026, 3, 5, 3, 15, 30, 0))
    useEditorStore.getState().togglePlay()
    useEditorStore.getState().togglePlay()

    vi.setSystemTime(new Date(2026, 3, 5, 4, 20, 45, 0))
    useEditorStore.getState().togglePlay()

    const state = useEditorStore.getState()
    expect(state.isPlaying).toBe(true)
    expect(state.playbackMs).toBe(0)
    expect(state.handBaseAngles.secondArbor).toBeCloseTo(270, 6)
    expect(state.handBaseAngles.minuteArbor).toBeCloseTo(124.5, 6)
    expect(state.handBaseAngles.hourArbor).toBeCloseTo(130.375, 6)
  })
})
