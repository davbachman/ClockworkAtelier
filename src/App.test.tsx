import { fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { resetEditorStore, useEditorStore } from './store/editorStore'

function mockSvgBounds(svgElement: SVGSVGElement) {
  vi.spyOn(svgElement, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 1200,
    height: 900,
    top: 0,
    left: 0,
    right: 1200,
    bottom: 900,
    toJSON: () => '',
  })
}

function placeGear(teeth = '40', clientX = 700, clientY = 450) {
  fireEvent.change(screen.getByTestId('tooth-input'), { target: { value: teeth } })
  fireEvent.pointerDown(screen.getByTestId('gear-create-button'), {
    button: 0,
    pointerId: 9,
    clientX: 20,
    clientY: 20,
  })
  fireEvent.pointerMove(window, { pointerId: 9, clientX, clientY })
  fireEvent.pointerUp(window, { button: 0, pointerId: 9, clientX, clientY })
}

function selectMode(mode: 'clock' | 'orrery') {
  fireEvent.click(screen.getByTestId('menu-trigger-mode'))
  fireEvent.click(screen.getByTestId(`menu-item-mode-${mode}`))
}

function toggleExtraLayer(order: number) {
  fireEvent.click(screen.getByTestId('menu-trigger-extra'))
  fireEvent.click(screen.getByTestId(`menu-item-extra-${order}`))
}

describe('App', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('starts in clock mode and toggles to orrery mode from the mode menu', () => {
    render(<App />)

    expect(screen.getByTestId('dial-ring-fill')).toBeInTheDocument()
    expect(screen.getByTestId('layer-button-1')).toHaveTextContent('Second Hand Layer')
    expect(screen.queryByTestId('layer-button-4')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('new-layer-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('am-pm-dial')).not.toBeInTheDocument()
    expect(screen.queryByTestId('day-dial')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('menu-trigger-mode'))
    expect(screen.getByTestId('menu-item-mode-clock')).toHaveAttribute('data-checked', 'true')
    expect(screen.getByTestId('menu-item-mode-orrery')).toHaveAttribute('data-checked', 'false')
    fireEvent.click(screen.getByTestId('menu-item-mode-orrery'))

    expect(screen.queryByTestId('dial-ring-fill')).not.toBeInTheDocument()
    expect(screen.getByTestId('layer-button-1')).toHaveTextContent('Mercury')
    expect(screen.queryByTestId('layer-button-5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-6')).not.toBeInTheDocument()
    expect(screen.queryByTestId('new-layer-button')).not.toBeInTheDocument()
    expect(screen.queryByTestId('motor-label')).not.toBeInTheDocument()
  })

  it('creates a gear in the active workspace', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)
    placeGear()

    expect(screen.getByTestId('gear-gear-1')).toBeInTheDocument()
    expect(useEditorStore.getState().workspaces.clock.gears).toHaveLength(1)
  })

  it('opens the gear inspector on a single click', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)
    placeGear()

    const gearHitTarget = screen.getByTestId('gear-hit-gear-1')
    fireEvent.pointerDown(gearHitTarget, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })

    expect(screen.getByTestId('gear-inspector')).toHaveTextContent('Gear gear-1')
    expect(screen.getByTestId('gear-inspector')).toHaveTextContent('Teeth: 40')
  })

  it('loads a selected gear tooth count into the tooth input', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)
    placeGear()

    const gearHitTarget = screen.getByTestId('gear-hit-gear-1')
    fireEvent.pointerDown(gearHitTarget, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })

    expect(screen.getByTestId('tooth-input')).toHaveValue('40')
    expect(useEditorStore.getState().workspaces.clock.selectedGearId).toBe('gear-1')
  })

  it('preserves independent clock and orrery builds when switching modes', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)
    placeGear('40', 700, 450)

    selectMode('orrery')
    placeGear('24', 640, 320)

    expect(useEditorStore.getState().workspaces.clock.gears).toHaveLength(1)
    expect(useEditorStore.getState().workspaces.orrery.gears).toHaveLength(1)

    selectMode('clock')

    expect(screen.getByTestId('dial-ring-fill')).toBeInTheDocument()
    expect(useEditorStore.getState().activeMode).toBe('clock')
    expect(screen.getByTestId('gear-gear-1')).toBeInTheDocument()
  })

  it('shows the sun only when no orrery layer is selected while keeping planets visible', () => {
    render(<App />)

    selectMode('orrery')
    expect(screen.getByTestId('planet-earthArbor')).toBeInTheDocument()
    expect(screen.queryByTestId('planet-jupiterArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('planet-saturnArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sun-overlay')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('layer-button-1'))
    expect(screen.getByTestId('planet-earthArbor')).toBeInTheDocument()
    expect(screen.getByTestId('sun-overlay')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('layer-button-3'))
    expect(screen.getByTestId('planet-earthArbor')).toBeInTheDocument()
    expect(screen.queryByTestId('sun-overlay')).not.toBeInTheDocument()
  })

  it('enables the optional clock complications from their checkboxes', () => {
    render(<App />)

    expect(screen.queryByTestId('am-pm-dial')).not.toBeInTheDocument()
    expect(screen.queryByTestId('day-dial')).not.toBeInTheDocument()
    expect(screen.queryByTestId('arbor-amPmArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('arbor-dayArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-4')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-5')).not.toBeInTheDocument()

    toggleExtraLayer(4)
    expect(screen.getByTestId('layer-button-4')).toHaveTextContent('AM/PM')
    expect(screen.getByTestId('am-pm-dial')).toBeInTheDocument()
    expect(screen.getByTestId('am-pm-hand')).toBeInTheDocument()
    expect(screen.getByTestId('arbor-amPmArbor')).toBeInTheDocument()

    toggleExtraLayer(5)
    expect(screen.getByTestId('layer-button-5')).toHaveTextContent('Day')
    expect(screen.getByTestId('day-dial')).toBeInTheDocument()
    expect(screen.getByTestId('day-hand')).toBeInTheDocument()
    expect(screen.getByTestId('arbor-dayArbor')).toBeInTheDocument()
  })

  it('enables Jupiter and Saturn only when their extra menu items are checked', () => {
    render(<App />)

    selectMode('orrery')

    expect(screen.queryByTestId('planet-jupiterArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('planet-saturnArbor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-5')).not.toBeInTheDocument()
    expect(screen.queryByTestId('layer-button-6')).not.toBeInTheDocument()

    toggleExtraLayer(5)
    expect(screen.getByTestId('layer-button-5')).toHaveTextContent('Jupiter')
    expect(screen.getByTestId('planet-jupiterArbor')).toBeInTheDocument()

    toggleExtraLayer(6)
    expect(screen.getByTestId('layer-button-6')).toHaveTextContent('Saturn')
    expect(screen.getByTestId('planet-saturnArbor')).toBeInTheDocument()
  })

  it('only opens an orrery planet dialog in the no-selection overview state', () => {
    render(<App />)

    selectMode('orrery')
    fireEvent.click(screen.getByTestId('planet-earthArbor'), {
      clientX: 320,
      clientY: 240,
    })
    expect(screen.queryByTestId('planet-dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('layer-button-1'))
    fireEvent.click(screen.getByTestId('planet-earthArbor'), {
      clientX: 320,
      clientY: 240,
    })

    expect(screen.getByTestId('planet-dialog')).toHaveTextContent('Earth')
    expect(screen.getByTestId('planet-dialog')).toHaveTextContent('Target rate: 1/1 rev/year')
  })
})
