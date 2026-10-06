import { buildProjectSnapshot, createEmptyWorkspaceProject, parseProjectJson, serializeProject } from './project'

function project() {
  return buildProjectSnapshot('clock', {
    clock: createEmptyWorkspaceProject('clock'),
    orrery: createEmptyWorkspaceProject('orrery'),
  })
}

describe('project files', () => {
  it('round-trips enabled extras in both modes', () => {
    const original = project()
    original.clock.optionalLayerVisibility = { 'layer-4': true, 'layer-5': false }
    original.orrery.optionalLayerVisibility = { 'layer-5': true, 'layer-6': true }
    expect(parseProjectJson(serializeProject(original))).toEqual(original)
  })

  it('rejects duplicate gear identities within a workspace', () => {
    const invalid = project()
    const gear = { id: 'gear-1', layerId: 'layer-1', teeth: 24, center: { x: 0, y: 0 } }
    invalid.clock.gears = [gear, { ...gear, center: { x: 100, y: 0 } }]
    expect(() => parseProjectJson(JSON.stringify(invalid))).toThrow('Duplicate gear id')
  })

  it('keeps independent gear IDs valid across modes', () => {
    const valid = project()
    const gear = { id: 'gear-1', layerId: 'layer-1', teeth: 24, center: { x: 0, y: 0 } }
    valid.clock.gears = [gear]
    valid.orrery.gears = [gear]
    expect(() => parseProjectJson(JSON.stringify(valid))).not.toThrow()
  })

  it('makes existing optional-layer gears visible in older files', () => {
    const old = project()
    delete old.orrery.optionalLayerVisibility
    old.orrery.gears = [{ id: 'gear-1', layerId: 'layer-5', teeth: 24, center: { x: 0, y: 0 } }]
    expect(parseProjectJson(JSON.stringify(old)).orrery.optionalLayerVisibility).toEqual({ 'layer-5': true, 'layer-6': false })
  })
})
