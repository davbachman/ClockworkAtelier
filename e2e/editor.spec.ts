import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const workingOrreryProjectPath = path.resolve(
  process.cwd(),
  'e2e/fixtures/orrery-earth-working.json',
)
const wrongOrreryProjectPath = path.resolve(
  process.cwd(),
  'e2e/fixtures/orrery-earth-wrong.json',
)

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

async function importProject(page: Page, projectPath: string) {
  await page.locator('input[type=file]').setInputFiles(projectPath)
  await expect(page.getByText('Project imported.')).toBeVisible()
}

test('shows the optional clock complications when their checkboxes are enabled', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByTestId('am-pm-dial')).toHaveCount(0)
  await expect(page.getByTestId('day-dial')).toHaveCount(0)

  await page.getByTestId('layer-checkbox-4').check()
  await page.getByTestId('layer-checkbox-5').check()

  await expect(page.getByTestId('am-pm-dial')).toBeVisible()
  await expect(page.getByTestId('am-pm-hand')).toBeVisible()
  await expect(page.getByTestId('arbor-amPmArbor')).toBeVisible()
  await expect(page.getByTestId('day-dial')).toBeVisible()
  await expect(page.getByTestId('day-hand')).toBeVisible()
  await expect(page.getByTestId('arbor-dayArbor')).toBeVisible()
})

test('preserves separate clock and orrery builds when switching modes', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('tooth-input').fill('36')
  const workspace = page.getByTestId('workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  await dragNewGearTo(page, {
    x: (box?.x ?? 0) + 760,
    y: (box?.y ?? 0) + 430,
  })
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('mode-toggle')).toContainText('Orrery Atelier')
  await page.getByTestId('tooth-input').fill('24')
  await expect(page.getByTestId('planet-earthArbor')).toBeVisible()

  await dragNewGearTo(page, {
    x: (box?.x ?? 0) + 690,
    y: (box?.y ?? 0) + 330,
  })
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('mode-toggle')).toContainText('Clockwork Atelier')
  await expect(page.getByTestId('dial-ring-fill')).toBeVisible()
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('planet-earthArbor')).toBeVisible()
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
})

test('only opens planet dialogs from the no-selection overview while empty-canvas right drag still pans', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('mode-toggle').click()

  await expect(page.getByTestId('planet-earthArbor')).toBeVisible()
  const earthPlanet = page.getByTestId('planet-earthArbor')
  const planetBox = await earthPlanet.boundingBox()
  expect(planetBox).not.toBeNull()

  await page.mouse.click(
    (planetBox?.x ?? 0) + (planetBox?.width ?? 0) / 2,
    (planetBox?.y ?? 0) + (planetBox?.height ?? 0) / 2,
  )
  await expect(page.getByTestId('planet-dialog')).toHaveCount(0)

  await page.getByTestId('layer-button-1').click()
  await earthPlanet.click()
  await expect(page.getByTestId('planet-dialog')).toContainText('Earth')
  await expect(page.getByTestId('planet-dialog')).toContainText('Target rate: 1/1 rev/year')

  await page.mouse.click(40, 40)
  await expect(page.getByTestId('planet-dialog')).toHaveCount(0)

  const workspace = page.getByTestId('workspace-svg')
  const viewBoxBefore = await workspace.getAttribute('viewBox')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  const startX = (box?.x ?? 0) + 80
  const startY = (box?.y ?? 0) + 80
  await page.mouse.move(startX, startY)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(startX + 90, startY + 60, { steps: 8 })
  await page.mouse.up({ button: 'right' })

  const viewBoxAfter = await workspace.getAttribute('viewBox')
  expect(viewBoxAfter).not.toBe(viewBoxBefore)
})

test('shows working and wrong orrery badges for imported Earth trains', async ({ page }) => {
  await page.goto('/')

  await importProject(page, workingOrreryProjectPath)
  await expect(page.getByTestId('mode-toggle')).toContainText('Orrery Atelier')
  await expect(page.getByTestId('clock-status')).toContainText('WORKING ORRERY!')

  await importProject(page, wrongOrreryProjectPath)
  await expect(page.getByTestId('clock-status')).toContainText('WRONG ORBIT SPEED')
})
