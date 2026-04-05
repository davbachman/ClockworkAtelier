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

    fireEvent.click(screen.getByTestId('gear-create-button'))
    fireEvent.pointerMove(svgElement as SVGSVGElement, { clientX: 700, clientY: 450 })
    fireEvent.pointerUp(svgElement as SVGSVGElement, { button: 0, clientX: 700, clientY: 450 })

    expect(screen.getByTestId('gear-gear-1')).toBeInTheDocument()
  })

  it('uses the outer rim hit target for gear selection', () => {
    const { container } = render(<App />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).not.toBeNull()

    mockSvgBounds(svgElement as SVGSVGElement)

    fireEvent.change(screen.getByTestId('tooth-input'), { target: { value: '40' } })
    fireEvent.click(screen.getByTestId('gear-create-button'))
    fireEvent.pointerMove(svgElement as SVGSVGElement, { clientX: 700, clientY: 450 })
    fireEvent.pointerUp(svgElement as SVGSVGElement, { button: 0, clientX: 700, clientY: 450 })

    fireEvent.pointerDown(svgElement as SVGSVGElement, { button: 0, clientX: 50, clientY: 50 })

    const gearHitTarget = screen.getByTestId('gear-hit-gear-1')
    fireEvent.pointerDown(gearHitTarget, { button: 0, clientX: 700, clientY: 450 })

    expect(useEditorStore.getState().draftGear).toMatchObject({
      mode: 'moving',
      gearId: 'gear-1',
    })
  })

  it('renders minute and hour arbors with their corresponding layer groups', () => {
    render(<App />)

    expect(screen.getByTestId('layer-group-2')).toContainElement(screen.getByTestId('arbor-minuteArbor'))
    expect(screen.getByTestId('layer-group-3')).toContainElement(screen.getByTestId('arbor-hourArbor'))
  })
})
