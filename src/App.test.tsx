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

function placeGear(svgElement: SVGSVGElement, teeth = '40', clientX = 700, clientY = 450) {
  fireEvent.change(screen.getByTestId('tooth-input'), { target: { value: teeth } })
  fireEvent.click(screen.getByTestId('gear-create-button'))
  fireEvent.pointerMove(svgElement, { clientX, clientY })
  fireEvent.pointerUp(svgElement, { button: 0, clientX, clientY })
}

describe('App', () => {
  beforeEach(() => {
    resetEditorStore()
  })

  it('adds a new layer and allows toggling the active layer off', () => {
    render(<App />)

    expect(screen.getByTestId('dial-ring-fill')).toBeInTheDocument()
    expect(screen.getByText('XII')).toBeInTheDocument()
    expect(screen.getByTestId('dial-numeral-III')).toHaveAttribute(
      'transform',
      expect.stringContaining('rotate(90'),
    )
    expect(screen.getByTestId('layer-button-1')).toHaveTextContent('Second Hand Layer')
    expect(screen.getByTestId('layer-button-2')).toHaveTextContent('Minute Hand Layer')
    expect(screen.getByTestId('layer-button-3')).toHaveTextContent('Hour Hand Layer')

    fireEvent.click(screen.getByTestId('new-layer-button'))

    expect(screen.getByTestId('layer-button-4')).toBeInTheDocument()
    expect(screen.getByTestId('layer-button-1')).toHaveAttribute('data-active', 'true')

    fireEvent.click(screen.getByTestId('layer-button-1'))

    expect(screen.getByTestId('layer-button-1')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('gear-create-button')).toBeDisabled()
  })

  it('creates a gear on the active layer', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)

    fireEvent.change(screen.getByTestId('tooth-input'), { target: { value: '40' } })
    expect(screen.getByTestId('gear-create-button')).toBeEnabled()

    placeGear(svgElement as SVGSVGElement)

    expect(screen.getByTestId('gear-gear-1')).toBeInTheDocument()
  })

  it('opens the gear inspector on a single click', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)

    placeGear(svgElement as SVGSVGElement)

    const gearHitTarget = screen.getByTestId('gear-hit-gear-1')
    fireEvent.pointerDown(gearHitTarget, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 1, clientX: 700, clientY: 450 })

    expect(screen.getByTestId('gear-inspector')).toHaveTextContent('Gear gear-1')
    expect(screen.getByTestId('gear-inspector')).toHaveTextContent('Teeth: 40')
    expect(useEditorStore.getState().draftGear).toBeNull()
  })

  it('moves a gear on click and drag', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)
    placeGear(svgElement as SVGSVGElement)

    const gearHitTarget = screen.getByTestId('gear-hit-gear-1')
    fireEvent.pointerDown(gearHitTarget, { button: 0, pointerId: 2, clientX: 700, clientY: 450 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 760, clientY: 450 })
    fireEvent.pointerUp(window, { button: 0, pointerId: 2, clientX: 760, clientY: 450 })

    expect(useEditorStore.getState().gears[0]).toMatchObject({
      id: 'gear-1',
      center: { x: 160, y: 0 },
    })
    expect(screen.queryByTestId('gear-inspector')).not.toBeInTheDocument()
  })

  it('pans the canvas on a secondary-button drag', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)

    fireEvent.pointerDown(svgElement as SVGSVGElement, {
      button: 2,
      pointerId: 3,
      clientX: 600,
      clientY: 450,
    })
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 660, clientY: 510 })
    fireEvent.pointerUp(window, { button: 2, pointerId: 3, clientX: 660, clientY: 510 })

    expect(useEditorStore.getState().camera).toEqual({
      panX: -60,
      panY: -60,
    })
  })

  it('renders minute and hour arbors with their corresponding layer groups', () => {
    render(<App />)

    expect(screen.getByTestId('layer-group-2')).toContainElement(screen.getByTestId('arbor-minuteArbor'))
    expect(screen.getByTestId('layer-group-3')).toContainElement(screen.getByTestId('arbor-hourArbor'))
  })
})
