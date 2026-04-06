import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const WORLD_WIDTH = 1200
const WORLD_HEIGHT = 900
const importedProjectPath = path.resolve(
  process.cwd(),
  'e2e/fixtures/minute-layer-selection-project.json',
)

function getClientPointFromWorld(
  box: { x: number; y: number; width: number; height: number },
  center: { x: number; y: number },
) {
  return {
    x: box.x + ((center.x + WORLD_WIDTH / 2) / WORLD_WIDTH) * box.width,
    y: box.y + ((center.y + WORLD_HEIGHT / 2) / WORLD_HEIGHT) * box.height,
  }
}

async function importProject(page: Page) {
  await page.locator('input[type=file]').setInputFiles(importedProjectPath)
  await expect(page.getByText('Project imported.')).toBeVisible()
}

async function dragNewGearTo(
  page: Page,
  target: { x: number; y: number },
) {
  const buttonBox = await page.getByTestId('gear-create-button').boundingBox()
  expect(buttonBox).not.toBeNull()

  const startX = (buttonBox?.x ?? 0) + (buttonBox?.width ?? 0) / 2
  const startY = (buttonBox?.y ?? 0) + (buttonBox?.height ?? 0) / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()
}

async function armNewGearFromButton(page: Page) {
  await page.getByTestId('gear-create-button').click()
  await expect(page.getByTestId('gear-create-button')).toHaveAttribute('data-active', 'true')
}

test('creates a layer, places a gear, and opens the inspector from the gear center', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('new-layer-button').click()
  await expect(page.getByTestId('layer-button-4')).toBeVisible()

  await page.getByTestId('tooth-input').fill('36')

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  await dragNewGearTo(page, {
    x: (box?.x ?? 0) + 760,
    y: (box?.y ?? 0) + 430,
  })

  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.mouse.click((box?.x ?? 0) + 760, (box?.y ?? 0) + 430)

  await expect(page.getByTestId('gear-inspector')).toContainText('Gear gear-1')
  await expect(page.getByTestId('gear-inspector')).toContainText('Teeth: 36')
})

test('opens the inspector for a small gear centered on the minute arbor', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('layer-button-2').click()
  await page.getByTestId('tooth-input').fill('12')

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  const centerX = (box?.x ?? 0) + (box?.width ?? 0) / 2
  const centerY = (box?.y ?? 0) + (box?.height ?? 0) / 2

  await dragNewGearTo(page, { x: centerX, y: centerY })

  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.mouse.click(centerX, centerY)

  await expect(page.getByTestId('gear-inspector')).toContainText('Gear gear-1')
  await expect(page.getByTestId('gear-inspector')).toContainText('Teeth: 12')
})

test('arms new gear placement from the button before dragging on the canvas', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tooth-input').fill('24')
  await armNewGearFromButton(page)

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  const target = {
    x: (box?.x ?? 0) + 720,
    y: (box?.y ?? 0) + 430,
  }

  await page.mouse.move(target.x, target.y)
  await page.mouse.down()
  await page.mouse.up()

  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
})

test('selects all imported minute-layer gears at their centers', async ({ page }) => {
  await page.goto('/')
  await importProject(page)
  await page.getByTestId('layer-button-2').click()

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  const minuteGears = [
    { id: 'gear-3', teeth: 10, center: { x: -320.0619375803697, y: 270.40639866490875 } },
    { id: 'gear-4', teeth: 100, center: { x: -162.58489848113547, y: 265.1905402981534 } },
    { id: 'gear-5', teeth: 100, center: { x: 0, y: 0 } },
    { id: 'gear-6', teeth: 20, center: { x: -18.90433632896503, y: 170.8446171761553 } },
  ]

  for (const gear of minuteGears) {
    const point = getClientPointFromWorld(box!, gear.center)
    await page.mouse.click(point.x, point.y)
    await expect(page.getByTestId('gear-inspector')).toContainText(`Gear ${gear.id}`)
    await expect(page.getByTestId('gear-inspector')).toContainText(`Teeth: ${gear.teeth}`)
  }
})
