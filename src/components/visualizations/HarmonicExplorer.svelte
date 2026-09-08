<script lang="ts">
  import { onMount } from 'svelte'
  import {
    DEFAULT_HARMONIC_STATE,
    HARMONIC_LIMITS,
    HARMONIC_PRESETS,
    harmonicCsv,
    harmonicHasState,
    harmonicSamples,
    harmonicSearch,
    harmonicStateFromSearch,
    normalizeHarmonicState,
    type HarmonicState,
  } from '../../lib/visualizations/harmonics'

  export let initial: HarmonicState = DEFAULT_HARMONIC_STATE
  export let instanceId = 'harmonic-explorer'
  let mounted = false
  let svg: SVGSVGElement
  let state = normalizeHarmonicState(initial)
  $: samples = harmonicSamples(state)
  $: points = samples
    .map(({ x, y }) => `${(x * 100).toFixed(3)},${(50 - y * 20).toFixed(3)}`)
    .join(' ')
  $: summary = `Fundamental ${state.fundamental}, harmonic ${state.harmonic}, amplitude ${state.amplitude.toFixed(2)}, phase ${state.phase} degrees.`
  $: namespace = instanceId === 'harmonic-explorer' ? 'hv' : `${instanceId}-hv`

  onMount(() => {
    if (harmonicHasState(window.location.search, namespace))
      state = harmonicStateFromSearch(window.location.search, namespace)
    mounted = true
  })

  function setValue(name: keyof HarmonicState, value: number) {
    state = normalizeHarmonicState({ ...state, [name]: value })
    updateLocation()
  }

  function updateLocation() {
    if (!mounted) return
    const search = harmonicSearch(state, window.location.search, namespace)
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${search}${window.location.hash}`
    )
  }

  function applyPreset(name: keyof typeof HARMONIC_PRESETS) {
    state = { ...HARMONIC_PRESETS[name] }
    updateLocation()
  }

  function reset() {
    state = { ...DEFAULT_HARMONIC_STATE }
    updateLocation()
  }

  function download(name: string, contents: string, type: string) {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([contents], { type }))
    link.download = name
    link.click()
    URL.revokeObjectURL(link.href)
  }

  function downloadSvg() {
    const exported = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${summary}"><title>${summary}</title><rect width="100" height="100" fill="#ffffff"/><line x1="0" y1="50" x2="100" y2="50" stroke="#6f7a87" stroke-width="0.55" vector-effect="non-scaling-stroke"/><line x1="0" y1="10" x2="0" y2="90" stroke="#6f7a87" stroke-width="0.55" vector-effect="non-scaling-stroke"/><polyline points="${points}" fill="none" stroke="#2276ba" stroke-width="2.4" vector-effect="non-scaling-stroke"/></svg>`
    if (svg) download(`${instanceId}.svg`, exported, 'image/svg+xml')
  }
</script>

<section class="harmonic-explorer" aria-labelledby={`${instanceId}-title`}>
  <header>
    <p class="eyebrow">Signal composition</p>
    <h3 id={`${instanceId}-title`}>Fourier harmonic explorer</h3>
    <p>
      Explore the shape of a signal: combine two sine waves, then adjust its strength and timing.
    </p>
  </header>
  <figure>
    <svg
      id={`${instanceId}-svg`}
      bind:this={svg}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      role="img"
      aria-label={summary}
    >
      <title>{summary}</title>
      <line x1="0" y1="50" x2="100" y2="50" class="axis" />
      <line x1="0" y1="10" x2="0" y2="90" class="axis" />
      <polyline {points} class="curve" vector-effect="non-scaling-stroke" />
    </svg>
    <figcaption>
      <strong>f(x)</strong> = sin(2π·{state.fundamental}x) + {state.amplitude.toFixed(2)} sin(2π·{state.harmonic}x
      + {state.phase}°)
    </figcaption>
  </figure>
  <fieldset disabled={!mounted} aria-describedby="harmonic-help">
    <legend>Signal controls</legend>
    <label
      >Fundamental {state.fundamental}<input
        type="range"
        min={HARMONIC_LIMITS.fundamental.min}
        max={HARMONIC_LIMITS.fundamental.max}
        step={HARMONIC_LIMITS.fundamental.step}
        value={state.fundamental}
        on:input={(event) => setValue('fundamental', Number(event.currentTarget.value))}
      /></label
    >
    <label
      >Harmonic {state.harmonic}<input
        type="range"
        min={HARMONIC_LIMITS.harmonic.min}
        max={HARMONIC_LIMITS.harmonic.max}
        step={HARMONIC_LIMITS.harmonic.step}
        value={state.harmonic}
        on:input={(event) => setValue('harmonic', Number(event.currentTarget.value))}
      /></label
    >
    <label
      >Amplitude {state.amplitude.toFixed(2)}<input
        type="range"
        min={HARMONIC_LIMITS.amplitude.min}
        max={HARMONIC_LIMITS.amplitude.max}
        step={HARMONIC_LIMITS.amplitude.step}
        value={state.amplitude}
        on:input={(event) => setValue('amplitude', Number(event.currentTarget.value))}
      /></label
    >
    <label
      >Phase {state.phase}°<input
        type="range"
        min={HARMONIC_LIMITS.phase.min}
        max={HARMONIC_LIMITS.phase.max}
        step={HARMONIC_LIMITS.phase.step}
        value={state.phase}
        on:input={(event) => setValue('phase', Number(event.currentTarget.value))}
      /></label
    >
  </fieldset>
  <div class="actions" aria-label="Harmonic presets and downloads">
    {#each Object.keys(HARMONIC_PRESETS) as name}
      <button
        type="button"
        disabled={!mounted}
        on:click={() => applyPreset(name as keyof typeof HARMONIC_PRESETS)}>{name}</button
      >
    {/each}
    <button type="button" disabled={!mounted} on:click={reset}>Reset</button>
    <button
      type="button"
      disabled={!mounted}
      on:click={() => download('harmonic-samples.csv', harmonicCsv(state), 'text/csv')}
      >Download CSV</button
    >
    <button type="button" disabled={!mounted} on:click={downloadSvg}>Download SVG</button>
  </div>
  <p id="harmonic-help" class="help">
    {mounted
      ? 'This view has a shareable page address and can be downloaded as data or SVG.'
      : 'The default curve and equation remain available; controls will activate when ready.'}
  </p>
  <p class="status" role="status" aria-live="polite">{summary}</p>
</section>

<style>
  .harmonic-explorer {
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
  .help,
  .status {
    line-height: 1.5;
  }
  figure {
    margin: 1rem 0;
  }
  svg {
    display: block;
    width: 100%;
    height: clamp(170px, 30vw, 320px);
    border: 1px solid var(--wow-border);
    background: var(--wow-back);
  }
  .axis {
    stroke: var(--wow-border);
    stroke-width: 0.55;
    vector-effect: non-scaling-stroke;
  }
  .curve {
    fill: none;
    stroke: var(--wow-link);
    stroke-width: 2.4;
  }
  fieldset {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem 1rem;
    border: 1px solid var(--wow-border);
    padding: 0.9rem;
  }
  label {
    display: grid;
    gap: 0.3rem;
    font-family: var(--wow-font-mono, monospace);
  }
  input {
    accent-color: var(--wow-link);
    width: 100%;
  }
  .actions {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    margin-top: 0.9rem;
  }
  button {
    border: 1px solid var(--wow-border);
    background: var(--wow-back);
    color: var(--wow-text);
    cursor: pointer;
    font: inherit;
    padding: 0.42rem 0.6rem;
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
  button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }
  .help {
    margin-bottom: 0.2rem;
  }
  .status {
    margin: 0;
    font-family: var(--wow-font-mono, monospace);
    font-size: 0.9rem;
  }
  @media (max-width: 420px) {
    fieldset {
      grid-template-columns: 1fr;
    }
    svg {
      height: 170px;
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
</style>
