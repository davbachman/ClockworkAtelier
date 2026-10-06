import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import path from 'node:path'

const fixture = path.resolve('e2e/fixtures/orrery-earth-working.json')

async function canvasPixels(page: Page) {
  return page.getByTestId('workspace-3d').evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    const gl = canvas.getContext('webgl2')!
    const pixels = new Uint8Array(canvas.width * canvas.height * 4)
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    const colors = new Set<string>()
    let hash = 2166136261
    for (let index = 0; index < pixels.length; index += 16) {
      colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`)
      hash = Math.imul(hash ^ pixels[index], 16777619)
    }
    return { colors: colors.size, hash }
  })
}

test('saved extras survive a fresh page and a JSON round trip', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('menu-trigger-extra').click()
  await page.getByTestId('menu-item-extra-4').click()
  // Exercise the download path, also used by browsers without a file picker.
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }))
  const download = page.waitForEvent('download')
  await page.getByTestId('menu-trigger-file').click()
  await page.getByTestId('menu-item-file-save').click()
  const file = await download
  const saved = await file.path()
  expect(saved).not.toBeNull()
  await page.reload()
  await expect(page.getByTestId('am-pm-dial')).toHaveCount(0)
  await page.locator('input[type=file]').setInputFiles(saved!)
  await expect(page.getByTestId('am-pm-dial')).toBeVisible()
})

test('invalid imports and failed saves show errors without replacing the project', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(fixture)
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{bad') })
  await expect(page.getByRole('alert')).toContainText('Unable to import')
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
  await page.evaluate(() => Object.defineProperty(window, 'showSaveFilePicker', {
    value: async () => { throw new Error('Disk unavailable') }, configurable: true,
  }))
  await page.getByTestId('menu-trigger-file').click()
  await page.getByTestId('menu-item-file-save').click()
  await expect(page.getByRole('alert')).toContainText('Unable to save')
})

test('pause freezes flat gears and resumes their rotation', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(fixture)
  const gear = page.getByTestId('gear-gear-1')
  await page.getByTestId('play-button').click()
  await expect.poll(() => gear.getAttribute('transform')).not.toBe('rotate(0 -440 280)')
  await page.getByTestId('play-button').click()
  const paused = await gear.getAttribute('transform')
  expect(paused).not.toBe('rotate(0 -440 280)')
  await page.waitForTimeout(150)
  expect(await gear.getAttribute('transform')).toBe(paused)
  await page.getByTestId('play-button').click()
  await expect.poll(() => gear.getAttribute('transform')).not.toBe(paused)
})

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`3D renders, animates, pauses and rotates at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    await page.goto('/')
    await page.locator('input[type=file]').setInputFiles(fixture)
    await page.getByRole('button', { name: '3D', exact: true }).click()
    const canvas = page.getByTestId('workspace-3d')
    await expect(canvas).toBeVisible()
    await expect.poll(async () => (await canvasPixels(page)).colors).toBeGreaterThan(100)
    await page.waitForTimeout(500)
    const before = await canvasPixels(page)
    await page.getByTestId('play-button').click()
    await expect.poll(async () => (await canvasPixels(page)).hash).not.toBe(before.hash)
    await page.getByTestId('play-button').click()
    await page.waitForTimeout(100)
    const paused = await canvasPixels(page)
    await page.waitForTimeout(150)
    expect((await canvasPixels(page)).hash).toBe(paused.hash)
    const box = (await canvas.boundingBox())!
    await page.getByRole('button', { name: 'Rotate view', exact: true }).click()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55, { steps: 5 })
    await page.mouse.up()
    await expect.poll(async () => (await canvasPixels(page)).hash).not.toBe(paused.hash)
    await page.getByRole('button', { name: 'Fit mechanism' }).click()
    await page.screenshot({ path: `output/playwright/orrery-3d-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Flat', exact: true }).click()
    await expect(page.getByTestId('gear-gear-1')).toBeVisible()
    const panel = (await page.locator('.workspace-panel').boundingBox())!
    const svg = (await page.getByTestId('workspace-svg').boundingBox())!
    expect(svg.height).toBeLessThanOrEqual(panel.height)
    expect(svg.y + svg.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
    await page.getByTestId('menu-trigger-mode').click()
    await page.getByTestId('menu-item-mode-clock').click()
    await page.locator('input[type=file]').setInputFiles(path.resolve('e2e/fixtures/clock-layered.json'))
    await expect(page.getByTestId('am-pm-dial')).toBeVisible()
    await expect(page.getByTestId('day-dial')).toBeVisible()
    await page.getByRole('button', { name: '3D', exact: true }).click()
    await expect.poll(async () => (await canvasPixels(page)).colors).toBeGreaterThan(50)
    const clockBefore = await canvasPixels(page)
    await page.getByTestId('play-button').click()
    await expect.poll(async () => (await canvasPixels(page)).hash).not.toBe(clockBefore.hash)
    await page.getByTestId('play-button').click()
    await page.waitForTimeout(100)
    await page.screenshot({ path: `output/playwright/clock-3d-${viewport.width}.png` })
    const focusedClock = await canvasPixels(page)
    await page.getByTestId('layer-button-1').click()
    await expect.poll(async () => (await canvasPixels(page)).hash).not.toBe(focusedClock.hash)
    await page.screenshot({ path: `output/playwright/clock-3d-overview-${viewport.width}.png` })
    await page.getByTestId('layer-button-1').click()
    await expect.poll(async () => (await canvasPixels(page)).hash).toBe(focusedClock.hash)
    expect(errors).toEqual([])
  })
}

test('3D gears can be placed, inspected, moved and undone across views', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect.poll(async () => (await canvasPixels(page)).colors).toBeGreaterThan(50)
  await page.getByTestId('tooth-input').fill('24')
  await page.getByTestId('gear-create-button').click()
  const box = (await page.getByTestId('workspace-3d').boundingBox())!
  const start = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.6 }
  await page.mouse.click(start.x, start.y)
  await page.mouse.click(start.x, start.y)
  await expect(page.getByTestId('gear-inspector')).toContainText('Teeth: 24')
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 60, start.y + 50, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Flat', exact: true }).click()
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
  const moved = await page.getByTestId('gear-gear-1').getAttribute('transform')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('gear-gear-1')).not.toHaveAttribute('transform', moved!)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('gear-gear-1')).toHaveCount(0)
})

test('a lost WebGL context offers the flat editor with the project intact', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type=file]').setInputFiles(fixture)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect.poll(async () => (await canvasPixels(page)).colors).toBeGreaterThan(100)
  await page.getByTestId('workspace-3d').evaluate((canvas) => {
    (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext()
  })
  await page.getByRole('button', { name: 'Return to flat view' }).click()
  await expect(page.getByTestId('gear-gear-1')).toBeVisible()
})
