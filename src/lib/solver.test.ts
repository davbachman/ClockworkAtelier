import { AM_PM_DIAL_CENTER, BASE_LAYERS, MOTOR_CENTER, ORRERY_LAYERS, getModeConfig } from './constants'
import { getPitchRadius } from './geometry'
import { analyzeClockwork, resolveModeStatus } from './solver'

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

    const analysis = analyzeClockwork('clock', [gearA, gearB], BASE_LAYERS)

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

    const analysis = analyzeClockwork('clock', [gearA, gearB, gearC], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-3'].rpm).toBeCloseTo(-2, 6)
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

    const analysis = analyzeClockwork('clock', [gearA, gearB, gearC], BASE_LAYERS)

    expect(analysis.computedByGearId['gear-1']).toEqual({
      rpm: null,
      drivenByMotor: true,
      conflicts: true,
    })
    expect(analysis.computedByGearId['gear-2'].conflicts).toBe(true)
    expect(analysis.computedByGearId['gear-3'].rpm).toBeNull()
  })

  it('marks a solved Earth train as correct in orrery mode', () => {
    const midpoint = {
      x: (MOTOR_CENTER.x + 0) / 2,
      y: (MOTOR_CENTER.y + 0) / 2,
    }
    const gearA = {
      id: 'gear-1',
      teeth: 100,
      layerId: 'layer-3',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 82,
      layerId: 'layer-3',
      center: midpoint,
    }
    const gearC = {
      id: 'gear-3',
      teeth: 100,
      layerId: 'layer-3',
      center: { x: 0, y: 0 },
    }

    const analysis = analyzeClockwork('orrery', [gearA, gearB, gearC], ORRERY_LAYERS)

    expect(analysis.outputStates.earthArbor.rpm).toBeCloseTo(1, 6)
    expect(analysis.outputStates.earthArbor.correct).toBe(true)
    expect(analysis.outputStates.mercuryArbor.correct).toBe(false)
  })

  it('detects a driven clock output on the offset AM/PM arbor', () => {
    const gearA = {
      id: 'gear-1',
      teeth: 220,
      layerId: 'layer-4',
      center: MOTOR_CENTER,
    }
    const gearB = {
      id: 'gear-2',
      teeth: 224,
      layerId: 'layer-4',
      center: AM_PM_DIAL_CENTER,
    }

    const analysis = analyzeClockwork('clock', [gearA, gearB], getModeConfig('clock').layers)

    expect(analysis.outputStates.amPmArbor.driven).toBe(true)
    expect(analysis.outputStates.amPmArbor.rpm).toBeCloseTo(-220 / 224, 3)
  })

  it('uses the configured clock target speeds for the optional complications', () => {
    const outputs = getModeConfig('clock').outputs

    expect(outputs.find((output) => output.id === 'amPmArbor')?.targetRpm).toBeCloseTo(1 / 720, 8)
    expect(outputs.find((output) => output.id === 'dayArbor')?.targetRpm).toBeCloseTo(1 / 10080, 10)
  })

  it('uses the configured orrery target speed ratios', () => {
    const outputs = getModeConfig('orrery').outputs

    expect(outputs.find((output) => output.id === 'earthArbor')?.targetRpm).toBeCloseTo(1, 8)
    expect(outputs.find((output) => output.id === 'mercuryArbor')?.targetRpm).toBeCloseTo(365 / 88, 8)
    expect(outputs.find((output) => output.id === 'saturnArbor')?.targetRpm).toBeCloseTo(365 / 10759, 10)
  })

  it('derives working and wrong status labels from the active mode', () => {
    const working = resolveModeStatus('orrery', {
      mercuryArbor: {
        id: 'mercuryArbor',
        label: 'Mercury',
        rpm: 365 / 88,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 365 / 88,
      },
      venusArbor: {
        id: 'venusArbor',
        label: 'Venus',
        rpm: 365 / 225,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 365 / 225,
      },
      earthArbor: {
        id: 'earthArbor',
        label: 'Earth',
        rpm: 1,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 1,
      },
      marsArbor: {
        id: 'marsArbor',
        label: 'Mars',
        rpm: 365 / 687,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 365 / 687,
      },
      jupiterArbor: {
        id: 'jupiterArbor',
        label: 'Jupiter',
        rpm: 365 / 4333,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 365 / 4333,
      },
      saturnArbor: {
        id: 'saturnArbor',
        label: 'Saturn',
        rpm: 365 / 10759,
        driven: true,
        conflicts: false,
        correct: true,
        targetRpm: 365 / 10759,
      },
    })

    const wrong = resolveModeStatus('orrery', {
      mercuryArbor: {
        id: 'mercuryArbor',
        label: 'Mercury',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
        targetRpm: 365 / 88,
      },
      venusArbor: {
        id: 'venusArbor',
        label: 'Venus',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
        targetRpm: 365 / 225,
      },
      earthArbor: {
        id: 'earthArbor',
        label: 'Earth',
        rpm: -1,
        driven: true,
        conflicts: false,
        correct: false,
        targetRpm: 1,
      },
      marsArbor: {
        id: 'marsArbor',
        label: 'Mars',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
        targetRpm: 365 / 687,
      },
      jupiterArbor: {
        id: 'jupiterArbor',
        label: 'Jupiter',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
        targetRpm: 365 / 4333,
      },
      saturnArbor: {
        id: 'saturnArbor',
        label: 'Saturn',
        rpm: null,
        driven: false,
        conflicts: false,
        correct: false,
        targetRpm: 365 / 10759,
      },
    })

    expect(working).toEqual({ kind: 'working', label: 'WORKING ORRERY!' })
    expect(wrong).toEqual({ kind: 'wrong', label: 'WRONG ORBIT SPEED' })
  })
})
