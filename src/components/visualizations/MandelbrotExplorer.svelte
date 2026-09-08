<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import {
    DEFAULT_MANDELBROT_VIEW,
    MANDELBROT_LIMITS,
    MANDELBROT_PRESETS,
    MANDELBROT_SIZE,
    isCurrentMandelbrotRequest,
    normalizeMandelbrotView,
    type MandelbrotView,
  } from '../../lib/visualizations/mandelbrot'
  import type {
    MandelbrotWorkerRequest,
    MandelbrotWorkerResponse,
  } from '../../lib/visualizations/mandelbrot.worker'

  let view: MandelbrotView = { ...DEFAULT_MANDELBROT_VIEW }
  let canvas: HTMLCanvasElement
  let worker: Worker | undefined
  let ready = false
  let requestId = 0
  let pendingRequestId: number | undefined
  let renderedView: MandelbrotView | undefined
  let renderedPreset: string | undefined
  let latestRequestSucceeded = false
  let status = 'Preparing the selected view.'

  function presetFor(view: MandelbrotView): string | undefined {
    return Object.entries(MANDELBROT_PRESETS).find(([, preset]) =>
      Object.entries(preset).every(([key, value]) => view[key as keyof MandelbrotView] === value)
    )?.[0]
  }

  function describeView(rendered: MandelbrotView, preset = presetFor(rendered)): string {
    return `${preset ?? 'custom view'} at ${rendered.iterations} escape iterations`
  }

  function visibleStatus(): string {
    return renderedView ? `Showing ${describeView(renderedView, renderedPreset)}.` : ''
  }

  function render() {
    if (!worker || !canvas) return
    const id = ++requestId
    pendingRequestId = id
    latestRequestSucceeded = false
    status = `Drawing ${describeView(view)}… ${visibleStatus()}`.trim()
    const request: MandelbrotWorkerRequest = {
      id,
      width: MANDELBROT_SIZE.width,
      height: MANDELBROT_SIZE.height,
      view: { ...view },
    }
    worker.postMessage(request)
  }

  function selectPreset(name: keyof typeof MANDELBROT_PRESETS) {
    view = { ...MANDELBROT_PRESETS[name] }
    render()
  }

  function updateIterations(value: number) {
    view = normalizeMandelbrotView({ ...view, iterations: value })
    render()
  }

  function download() {
    if (!latestRequestSucceeded || pendingRequestId !== undefined) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'mandelbrot-view.png'
    link.click()
  }

  onMount(() => {
    worker = new Worker(new URL('../../lib/visualizations/mandelbrot.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = ({ data }: MessageEvent<MandelbrotWorkerResponse>) => {
      if (!isCurrentMandelbrotRequest(data.id, requestId)) return
      pendingRequestId = undefined
      if (!data.ok) {
        latestRequestSucceeded = false
        status = `Rendering failed: ${data.message}. ${visibleStatus() || 'The initial static image remains available.'}`
        return
      }
      const context = canvas.getContext('2d')
      if (!context) {
        latestRequestSucceeded = false
        status = `Could not draw ${describeView(view)}. ${visibleStatus() || 'The initial static image remains available.'}`
        return
      }
      context.putImageData(
        new ImageData(
          new Uint8ClampedArray(data.pixels),
          MANDELBROT_SIZE.width,
          MANDELBROT_SIZE.height
        ),
        0,
        0
      )
      ready = true
      renderedView = { ...view }
      renderedPreset = presetFor(renderedView)
      latestRequestSucceeded = true
      status = visibleStatus()
    }
    worker.onerror = () => {
      pendingRequestId = undefined
      latestRequestSucceeded = false
      status = `Could not draw ${describeView(view)}. ${visibleStatus() || 'The initial static image remains available.'}`
    }
    render()
  })
  onDestroy(() => worker?.terminate())
</script>

<section class="mandelbrot-explorer" aria-labelledby="mandelbrot-title">
  <header>
    <p class="eyebrow">Complex plane</p>
    <h3 id="mandelbrot-title">Mandelbrot explorer</h3>
    <p>
      Pick a familiar region of the set, then increase the escape limit to expose more boundary
      detail.
    </p>
  </header>
  <figure>
    <div class:ready class="image-frame">
      <img
        src="/examples/mandelbrot.png"
        loading="lazy"
        decoding="async"
        width={MANDELBROT_SIZE.width}
        height={MANDELBROT_SIZE.height}
        alt="The full Mandelbrot set, black inside with blue escape bands outside."
        aria-hidden={ready}
      /><canvas
        bind:this={canvas}
        width={MANDELBROT_SIZE.width}
        height={MANDELBROT_SIZE.height}
        aria-label={renderedView
          ? `Mandelbrot rendering of ${describeView(renderedView, renderedPreset)}`
          : 'Mandelbrot rendering is not ready'}
        aria-hidden={!ready}
      ></canvas>
    </div>
    <figcaption>
      Points remain black when their orbit does not escape within the selected iteration bound; blue
      bands encode escape time.
    </figcaption>
  </figure>
  <fieldset disabled={!ready}>
    <legend>View controls</legend>
    <div class="presets">
      {#each Object.keys(MANDELBROT_PRESETS) as name}<button
          type="button"
          on:click={() => selectPreset(name as keyof typeof MANDELBROT_PRESETS)}>{name}</button
        >{/each}<button type="button" on:click={() => selectPreset('Full set')}>Reset</button>
    </div>
    <label
      >Escape iterations: {view.iterations}<input
        type="number"
        min={MANDELBROT_LIMITS.iterations.min}
        max={MANDELBROT_LIMITS.iterations.max}
        step="10"
        value={view.iterations}
        on:change={(event) => updateIterations(Number(event.currentTarget.value))}
      /></label
    >
  </fieldset>
  <p class="actions">
    <button
      type="button"
      disabled={!ready || pendingRequestId !== undefined || !latestRequestSucceeded}
      on:click={download}>Download current PNG</button
    >
  </p>
  <p class="status" role="status" aria-live="polite">{status}</p>
</section>

<style>
  .mandelbrot-explorer {
    margin: 2rem 0;
    padding: clamp(1rem, 3vw, 1.5rem);
    border: 1px solid var(--wow-border);
    background: var(--wow-back-alt);
    color: var(--wow-text);
    font-family: var(--wow-font-text, monospace);
  }
  .eyebrow {
    margin: 0;
    color: var(--wow-link);
    font-family: var(--wow-font-mono, monospace);
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h3 {
    margin: 0.3rem 0;
  }
  header p:last-child,
  figcaption,
  .status {
    line-height: 1.5;
  }
  .image-frame {
    position: relative;
    aspect-ratio: 3 / 2;
    border: 1px solid var(--wow-border);
    background: #000;
  }
  .image-frame img,
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  .image-frame canvas {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .image-frame.ready canvas {
    opacity: 1;
  }
  fieldset {
    border: 1px solid var(--wow-border);
    padding: 0.9rem;
  }
  .presets,
  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    margin-bottom: 0.8rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
    max-width: 20rem;
    font-family: var(--wow-font-mono, monospace);
  }
  input {
    width: 100%;
    accent-color: var(--wow-link);
  }
  button {
    border: 1px solid var(--wow-border);
    background: var(--wow-back);
    color: var(--wow-text);
    cursor: pointer;
    font: inherit;
    padding: 0.42rem 0.6rem;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  button:not(:disabled):hover {
    border-color: #2276ba;
    color: var(--wow-link);
  }
  button:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--wow-link);
    outline-offset: 2px;
  }
  .status {
    margin-bottom: 0;
    font-family: var(--wow-font-mono, monospace);
    font-size: 0.9rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .image-frame canvas {
      transition: none;
    }
  }
</style>
