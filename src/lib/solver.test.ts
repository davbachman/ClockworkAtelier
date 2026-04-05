import { BASE_LAYERS, HAND_TARGET_RPM, MOTOR_CENTER } from './constants'
import { getPitchRadius } from './geometry'
import { analyzeClockwork, resolveClockStatus } from './solver'

describe('solver', () => {
  it('propagates rpm through meshed gears', () => {
    const gearA = {
      id: 'gear-1',
      teeth: 40,
      layerId: 'layer-1',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 20,
      layerId: 'layer-1',
      center: {
        x: MOTOR_CENTER.x + getPitchRadius(40) + getPitchRadius(20),
        y: MOTOR_CENTER.y,
      },
    }

    const analysis = analyzeClockwork([gearA, gearB], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-1']).toMatchObject({
      rpm: 1,
      drivenByMotor: true,
      conflicts: false,
    })
    expect(analysis.computedByGearId['gear-2'].rpm).toBeCloseTo(-2, 6)
  })

  it('propagates rpm through coaxial gears on different layers', () => {
    const gearA = {
      id: 'gear-1',
      teeth: 40,
      layerId: 'layer-1',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 20,
      layerId: 'layer-1',
      center: {
        x: MOTOR_CENTER.x + getPitchRadius(40) + getPitchRadius(20),
        y: MOTOR_CENTER.y,
      },
    }
    const gearC = {
      id: 'gear-3',
      teeth: 50,
      layerId: 'layer-2',
      center: gearB.center,
    }

    const analysis = analyzeClockwork([gearA, gearB, gearC], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-3'].rpm).toBeCloseTo(-2, 6)
  })

  it('drives concentric motor gears across multiple layers', () => {
    const gearA = {
      id: 'gear-1',
      teeth: 30,
      layerId: 'layer-1',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 54,
      layerId: 'layer-2',
      center: MOTOR_CENTER,
    }
    const gearC = {
      id: 'gear-3',
      teeth: 22,
      layerId: 'layer-3',
      center: MOTOR_CENTER,
    }

    const analysis = analyzeClockwork([gearA, gearB, gearC], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-1'].rpm).toBeCloseTo(1, 6)
    expect(analysis.computedByGearId['gear-2'].rpm).toBeCloseTo(1, 6)
    expect(analysis.computedByGearId['gear-3'].rpm).toBeCloseTo(1, 6)
    expect(analysis.computedByGearId['gear-2'].drivenByMotor).toBe(true)
  })

  it('marks contradictory loops as conflicts', () => {
    const radius = getPitchRadius(20)
    const gearA = {
      id: 'gear-1',
      teeth: 20,
      layerId: 'layer-1',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 20,
      layerId: 'layer-1',
      center: { x: MOTOR_CENTER.x + radius * 2, y: MOTOR_CENTER.y },
    }
    const gearC = {
      id: 'gear-3',
      teeth: 20,
      layerId: 'layer-1',
      center: {
        x: MOTOR_CENTER.x + radius,
        y: MOTOR_CENTER.y + Math.sqrt(3) * radius,
      },
    }

    const analysis = analyzeClockwork([gearA, gearB, gearC], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-1']).toEqual({
      rpm: null,
      drivenByMotor: true,
      conflicts: true,
    })
    expect(analysis.computedByGearId['gear-2'].conflicts).toBe(true)
    expect(analysis.computedByGearId['gear-3'].rpm).toBeNull()
  })

  it('derives working and wrong status from hand states', () => {
    const working = resolveClockStatus({
      secondArbor: {
        anchor: 'secondArbor',
        rpm: HAND_TARGET_RPM.secondArbor,
        driven: true,
        conflicts: false,
        correct: true,
      },
      minuteArbor: {
        anchor: 'minuteArbor',
        rpm: HAND_TARGET_RPM.minuteArbor,
        driven: true,
        conflicts: false,
        correct: true,
      },
      hourArbor: {
        anchor: 'hourArbor',
        rpm: HAND_TARGET_RPM.hourArbor,
        driven: true,
        conflicts: false,
        correct: true,
      },
    })
    const wrong = resolveClockStatus({
      secondArbor: {
        anchor: 'secondArbor',
        rpm: -1,
        driven: true,
        conflicts: false,
        correct: false,
      },
      minuteArbor: {
        anchor: 'minuteArbor',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
      },
      hourArbor: {
        anchor: 'hourArbor',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
      },
    })
    const incomplete = resolveClockStatus({
      secondArbor: {
        anchor: 'secondArbor',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
      },
      minuteArbor: {
        anchor: 'minuteArbor',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
      },
      hourArbor: {
        anchor: 'hourArbor',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
      },
    })

    expect(working).toEqual({ kind: 'working', label: 'WORKING CLOCK!' })
    expect(wrong).toEqual({ kind: 'wrong', label: 'WRONG HAND SPEED' })
    expect(incomplete).toBeNull()
  })
})
