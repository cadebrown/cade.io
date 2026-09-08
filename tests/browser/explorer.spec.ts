import { expect, test } from '@playwright/test'

type WorkerRequest = { id: number; width: number; height: number }

declare global {
  interface Window {
    mandelbrotWorker: {
      requests: () => WorkerRequest[]
      respond: (id: number, error?: string) => void
    }
  }
}

test('Mandelbrot waits for its latest worker rendering before exposing a matching download', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const requests: Array<{
      worker: Worker
      request: { id: number; width: number; height: number }
    }> = []

    class DelayedWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: ((event: ErrorEvent) => void) | null = null

      constructor(..._args: unknown[]) {}

      postMessage(request: { id: number; width: number; height: number }) {
        requests.push({ worker: this as unknown as Worker, request })
      }

      terminate() {}
    }

    Object.defineProperty(window, 'Worker', { value: DelayedWorker })
    window.mandelbrotWorker = {
      requests: () => requests.map(({ request }) => request),
      respond: (id, error) => {
        const pending = requests.find(({ request }) => request.id === id)
        if (!pending) throw new Error(`Unknown worker request ${id}`)
        const pixels = new Uint8ClampedArray(pending.request.width * pending.request.height * 4)
        pending.worker.onmessage?.({
          data: error ? { id, ok: false, message: error } : { id, ok: true, pixels: pixels.buffer },
        } as MessageEvent)
      },
    }
  })

  await page.goto('/test')
  const explorer = page.locator('section.mandelbrot-explorer')
  const fallback = explorer.locator('.image-frame img[src="/examples/mandelbrot.png"]')
  await expect(fallback).toHaveAttribute(
    'alt',
    'The full Mandelbrot set, black inside with blue escape bands outside.'
  )
  await expect(fallback).not.toHaveAttribute('aria-hidden', 'true')

  await explorer.scrollIntoViewIfNeeded()
  await expect.poll(() => page.evaluate(() => window.mandelbrotWorker.requests().length)).toBe(1)
  await expect(
    explorer.getByRole('button', { name: 'Download current PNG', exact: true })
  ).toBeDisabled()
  await page.evaluate(() => window.mandelbrotWorker.respond(1))

  const canvas = explorer.locator('canvas')
  const download = explorer.getByRole('button', { name: 'Download current PNG', exact: true })
  await expect(download).toBeEnabled()
  await expect(fallback).toHaveAttribute('aria-hidden', 'true')
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Mandelbrot rendering of Full set at 180 escape iterations'
  )

  await explorer.getByRole('button', { name: 'Seahorse valley', exact: true }).click()
  await expect(download).toBeDisabled()
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Mandelbrot rendering of Full set at 180 escape iterations'
  )
  await explorer.getByRole('button', { name: 'Elephant valley', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.mandelbrotWorker.requests().length)).toBe(3)

  await page.evaluate(() => window.mandelbrotWorker.respond(2))
  await expect(download).toBeDisabled()
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Mandelbrot rendering of Full set at 180 escape iterations'
  )

  await page.evaluate(() => window.mandelbrotWorker.respond(3))
  await expect(download).toBeEnabled()
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Mandelbrot rendering of Elephant valley at 360 escape iterations'
  )
  await expect(explorer.getByRole('status')).toHaveText(
    'Showing Elephant valley at 360 escape iterations.'
  )

  await explorer.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.evaluate(() => window.mandelbrotWorker.respond(4, 'Fixture failed'))
  await expect(download).toBeDisabled()
  await expect(explorer.getByRole('status')).toHaveText(
    'Rendering failed: Fixture failed. Showing Elephant valley at 360 escape iterations.'
  )
  await expect(canvas).toHaveAttribute(
    'aria-label',
    'Mandelbrot rendering of Elephant valley at 360 escape iterations'
  )
  await explorer.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.evaluate(() => window.mandelbrotWorker.respond(5))
  await expect(download).toBeEnabled()
  await expect(explorer.getByRole('status')).toHaveText(
    'Showing Full set at 180 escape iterations.'
  )
})
