import { expect, test } from '@playwright/test'

test('creates a layer, places a gear, and opens the inspector from the gear center', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('new-layer-button').click()
  await expect(page.getByTestId('layer-button-4')).toBeVisible()

  await page.getByTestId('tooth-input').fill('36')
  await page.getByTestId('gear-create-button').click()

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  await page.mouse.move((box?.x ?? 0) + 760, (box?.y ?? 0) + 430)
  await page.mouse.click((box?.x ?? 0) + 760, (box?.y ?? 0) + 430)

  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.mouse.click((box?.x ?? 0) + 760, (box?.y ?? 0) + 430)

  await expect(page.getByTestId('gear-inspector')).toContainText('Gear gear-1')
  await expect(page.getByTestId('gear-inspector')).toContainText('Teeth: 36')
})

test('opens the inspector for a small gear centered on the minute arbor', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('layer-button-2').click()
  await page.getByTestId('tooth-input').fill('12')
  await page.getByTestId('gear-create-button').click()

  const workspace = page.locator('svg.workspace-svg')
  const box = await workspace.boundingBox()
  expect(box).not.toBeNull()

  const centerX = (box?.x ?? 0) + (box?.width ?? 0) / 2
  const centerY = (box?.y ?? 0) + (box?.height ?? 0) / 2

  await page.mouse.move(centerX, centerY)
  await page.mouse.click(centerX, centerY)

  await expect(page.getByTestId('gear-gear-1')).toBeVisible()

  await page.mouse.click(centerX, centerY)

  await expect(page.getByTestId('gear-inspector')).toContainText('Gear gear-1')
  await expect(page.getByTestId('gear-inspector')).toContainText('Teeth: 12')
})
