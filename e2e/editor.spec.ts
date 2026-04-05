import { expect, test } from '@playwright/test'

test('creates a layer and places a gear', async ({ page }) => {
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
})
