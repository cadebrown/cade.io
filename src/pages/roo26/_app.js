// _app.js — all client logic for the Roo '26 guide.
// Bundled by Astro; shared by /roo26, /roo26/map, /roo26/plan, /roo26/info.
import SCHED from './_data/schedule.json'
import POIS from './_data/pois.json'
import ARTISTS from './_data/artists.json'

const TZ = SCHED.tz || '-05:00' // Central Daylight Time on the Farm

// ───────────────────────── tiny helpers ─────────────────────────
const $ = (s, p = document) => p.querySelector(s)
const $$ = (s, p = document) => [...p.querySelectorAll(s)]

function el(tag, attrs = {}, ...kids) {
	const n = document.createElement(tag)
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'class') n.className = v
		else if (k === 'style') n.style.cssText = v
		else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
		else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v)
	}
	for (const k of kids.flat()) {
		if (k == null) continue
		n.append(k.nodeType ? k : document.createTextNode(k))
	}
	return n
}

const slug = (s) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')

const epoch = (iso) => new Date(iso + ':00' + TZ).getTime()

function fmtTime(iso) {
	// iso like "2026-06-11T14:00" — format without timezone math
	let [h, m] = iso.slice(11, 16).split(':').map(Number)
	const ap = h >= 12 ? 'PM' : 'AM'
	h = h % 12 || 12
	return `${h}:${String(m).padStart(2, '0')} ${ap}`
}

function hourLabel(iso) {
	let h = Number(iso.slice(11, 13))
	const ap = h >= 12 ? 'PM' : 'AM'
	h = h % 12 || 12
	return `${h} ${ap}`
}

let toastTimer
function toast(msg) {
	const t = $('#toast')
	t.textContent = msg
	t.hidden = false
	clearTimeout(toastTimer)
	toastTimer = setTimeout(() => (t.hidden = true), 2600)
}

// ───────────────────────── data prep ─────────────────────────
const STAGES = Object.fromEntries(SCHED.stages.map((s) => [s.id, s]))
const SETS = SCHED.sets
	.map((x) => {
		const stage = STAGES[x.s] || { id: x.s, name: x.s, color: '#888', short: x.s }
		return {
			id: `${x.d}-${x.s}-${slug(x.a)}`,
			artist: x.a,
			day: x.d,
			stage,
			start: x.t,
			end: x.e,
			startMs: x.t ? epoch(x.t) : null,
			endMs: x.e ? epoch(x.e) : null,
			info: ARTISTS[slug(x.a)] || null,
		}
	})
	.sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity))
const SET_BY_ID = Object.fromEntries(SETS.map((s) => [s.id, s]))

const FEST_START = epoch(SCHED.days[0].date + 'T00:00')
const FEST_END = epoch(SCHED.days.at(-1).date + 'T23:59') + 8 * 3600e3

// ───────────────────────── persistent state ─────────────────────────
const store = {
	get(k, d) {
		try {
			const v = localStorage.getItem('roo26:' + k)
			return v == null ? d : JSON.parse(v)
		} catch {
			return d
		}
	},
	set(k, v) {
		try {
			localStorage.setItem('roo26:' + k, JSON.stringify(v))
		} catch {}
	},
	del(k) {
		try {
			localStorage.removeItem('roo26:' + k)
		} catch {}
	},
}

const state = {
	tab: document.documentElement.dataset.tab || 'schedule',
	day: store.get('day', null) || currentFestDay() || SCHED.days[0].id,
	stage: 'all',
	search: '',
	favs: new Set(store.get('favs', [])),
	pins: store.get('pins', []), // [{id, emoji, name, lat, lon}] — camps & meetup spots
	placing: null, // pin payload waiting for a map tap: {emoji, name} | null
	pos: null, // latest geolocation fix {lat, lon, acc, at}
	locatePref: store.get('locate', null), // user's last explicit locate on/off choice
}

// migrate the old single "tent" pin into the pins list
{
	const tent = store.get('tent', null)
	if (tent) {
		state.pins.push({
			id: 'pin-' + Date.now(),
			emoji: '⛺',
			name: 'My camp',
			lat: tent.lat,
			lon: tent.lon,
		})
		store.set('pins', state.pins)
		store.del('tent')
	}
}

function currentFestDay() {
	// "festival day" rolls over at 6 AM — a 1 AM set still belongs to the previous day
	const now = Date.now() - 6 * 3600e3
	for (const d of SCHED.days) {
		if (now >= epoch(d.date + 'T00:00') && now < epoch(d.date + 'T23:59')) return d.id
	}
	return null
}

const saveFavs = () => store.set('favs', [...state.favs])
const savePins = () => store.set('pins', state.pins)

// ───────────────────────── router ─────────────────────────
const TAB_PATH = { schedule: '/roo26', map: '/roo26/map', plan: '/roo26/plan', info: '/roo26/info' }

function setTab(tab, push = true) {
	state.tab = tab
	$$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + tab))
	$$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === tab))
	if (push && location.pathname.replace(/\/$/, '') !== TAB_PATH[tab])
		history.pushState({}, '', TAB_PATH[tab])
	if (tab === 'map') initMap()
	if (tab === 'plan') renderPlan()
	if (tab === 'info') loadWeather()
	window.scrollTo({ top: 0 })
}

window.addEventListener('popstate', () => {
	const p = location.pathname.replace(/\/$/, '')
	const tab = Object.keys(TAB_PATH).find((k) => TAB_PATH[k] === p) || 'schedule'
	setTab(tab, false)
})

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.nav)))

// ───────────────────────── header live pill ─────────────────────────
function renderPill() {
	const pill = $('#livePill')
	const now = Date.now()
	if (now < FEST_START) {
		const d = Math.ceil((FEST_START - now) / 86400e3)
		pill.textContent = `${d} day${d === 1 ? '' : 's'} to go`
		pill.classList.remove('is-live')
	} else if (now < FEST_END) {
		const dayIdx = SCHED.days.findIndex((d) => d.id === currentFestDay())
		pill.textContent = dayIdx >= 0 ? `● LIVE · DAY ${dayIdx + 1}` : '● LIVE'
		pill.classList.add('is-live')
	} else {
		pill.textContent = "that's a wrap 🌈"
		pill.classList.remove('is-live')
	}
}

// ───────────────────────── schedule view ─────────────────────────
function setStatus(s, now = Date.now()) {
	if (!s.startMs) return 'tba'
	if (now >= s.startMs && now < (s.endMs ?? s.startMs + 3600e3)) return 'live'
	if (now >= (s.endMs ?? s.startMs + 3600e3)) return 'past'
	return 'next'
}

function favButton(set) {
	const on = () => state.favs.has(set.id)
	const b = el(
		'button',
		{
			class: 'fav-btn' + (on() ? ' faved' : ''),
			'aria-label': 'Save to My Roo',
			'aria-pressed': String(on()),
		},
		on() ? '★' : '☆',
	)
	b.addEventListener('click', (e) => {
		e.stopPropagation()
		toggleFav(set)
		b.classList.toggle('faved', on())
		b.textContent = on() ? '★' : '☆'
		b.setAttribute('aria-pressed', String(on()))
	})
	return b
}

function toggleFav(set) {
	if (state.favs.has(set.id)) {
		state.favs.delete(set.id)
		toast(`Removed ${set.artist} from My Roo`)
	} else {
		state.favs.add(set.id)
		toast(`★ ${set.artist} added to My Roo`)
	}
	saveFavs()
	renderFavCount()
	if (state.tab === 'plan') renderPlan()
}

function setRow(set) {
	const st = setStatus(set)
	const row = el(
		'div',
		{
			class: `set-row is-${st}`,
			style: `--sc:${set.stage.color}`,
			'data-id': set.id,
			role: 'button',
			tabindex: '0',
		},
		el(
			'div',
			{ class: 'set-time' },
			el('span', { class: 'st-s' }, set.start ? fmtTime(set.start) : 'TBA'),
			set.end ? el('span', { class: 'st-e' }, '– ' + fmtTime(set.end)) : null,
		),
		el(
			'div',
			{ class: 'set-main' },
			el('div', { class: 'set-artist' }, set.artist),
			el(
				'div',
				{ class: 'set-meta' },
				el('span', { class: 'stage-tag' }, set.stage.name.toUpperCase()),
				set.info?.g ? el('span', { class: 'genre-tag' }, set.info.g) : null,
				st === 'live' ? el('span', { class: 'live-tag' }, 'LIVE') : null,
			),
		),
		favButton(set),
	)
	row.addEventListener('click', () => openSheet(set))
	row.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') openSheet(set)
	})
	return row
}

function renderDayTabs() {
	const wrap = $('#dayTabs')
	wrap.replaceChildren(
		...SCHED.days.map((d) => {
			const b = el(
				'button',
				{
					class:
						'day-tab' +
						(d.id === state.day ? ' active' : '') +
						(d.id === currentFestDay() ? ' is-today' : ''),
				},
				el('span', { class: 'd-lbl' }, d.label),
				el('span', { class: 'd-date' }, 'Jun ' + Number(d.date.slice(8))),
			)
			b.addEventListener('click', () => {
				state.day = d.id
				store.set('day', d.id)
				renderDayTabs()
				renderSched()
			})
			return b
		}),
	)
}

function renderStageChips() {
	const wrap = $('#stageChips')
	const mk = (id, name, color) => {
		const c = el(
			'button',
			{
				class: 'chip' + (state.stage === id ? ' active' : ''),
				style: color ? `--chip-c:${color}` : '',
			},
			color ? el('span', { class: 'dot' }) : null,
			name,
		)
		c.addEventListener('click', () => {
			state.stage = id
			renderStageChips()
			renderSched()
		})
		return c
	}
	wrap.replaceChildren(
		mk('all', 'All stages', null),
		...SCHED.stages.map((s) => mk(s.id, s.name, s.color)),
	)
}

function visibleSets() {
	const q = state.search.trim().toLowerCase()
	return SETS.filter(
		(s) =>
			s.day === state.day &&
			(state.stage === 'all' || s.stage.id === state.stage) &&
			(!q || s.artist.toLowerCase().includes(q) || (s.info?.g || '').includes(q)),
	)
}

function renderSched() {
	const list = $('#schedList')
	const sets = visibleSets()
	if (!sets.length) {
		list.replaceChildren(
			el(
				'div',
				{ class: 'empty-note' },
				state.search ? `No artists matching “${state.search}” on this day.` : 'Nothing here yet.',
			),
		)
		return
	}
	const frag = document.createDocumentFragment()
	let lastH = null
	for (const s of sets) {
		const h = s.start ? hourLabel(s.start) : 'TBA'
		if (h !== lastH) {
			frag.append(el('div', { class: 'sched-group-h' }, h))
			lastH = h
		}
		frag.append(setRow(s))
	}
	list.replaceChildren(frag)
}

function renderNowStrip() {
	const now = Date.now()
	const live = SETS.filter((s) => setStatus(s, now) === 'live')
	const strip = $('#nowStrip')
	strip.hidden = live.length === 0
	if (!live.length) return
	$('#nowCards').replaceChildren(
		...live.map((s) => {
			const c = el(
				'button',
				{ class: 'now-card', style: `--sc:${s.stage.color}` },
				el('span', { class: 'nc-a' }, s.artist),
				el('span', { class: 'nc-s' }, `${s.stage.name} · until ${s.end ? fmtTime(s.end) : '?'}`),
			)
			c.addEventListener('click', () => openSheet(s))
			return c
		}),
	)
}

// refresh live/past classes in place without rebuilding (keeps scroll)
function refreshStatuses() {
	const now = Date.now()
	$$('#schedList .set-row, #planBody .set-row').forEach((row) => {
		const s = SET_BY_ID[row.dataset.id]
		if (!s) return
		const st = setStatus(s, now)
		row.classList.toggle('is-live', st === 'live')
		row.classList.toggle('is-past', st === 'past')
		const meta = $('.set-meta', row)
		const tag = $('.live-tag', row)
		if (st === 'live' && !tag) meta.append(el('span', { class: 'live-tag' }, 'LIVE'))
		if (st !== 'live' && tag) tag.remove()
	})
	renderNowStrip()
	renderPill()
}

$('#searchBox').addEventListener('input', (e) => {
	state.search = e.target.value
	renderSched()
})

$('#nowJump').addEventListener('click', () => {
	const today = currentFestDay()
	if (today && today !== state.day) {
		state.day = today
		store.set('day', today)
		renderDayTabs()
		renderSched()
	}
	const target =
		$('#schedList .set-row.is-live') ||
		$$('#schedList .set-row').find((r) => !r.classList.contains('is-past'))
	if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
	else toast('No upcoming sets on this day')
})

// ───────────────────────── artist detail sheet ─────────────────────────
let sheetSet = null

function openSheet(set) {
	sheetSet = set
	const a = set.info
	const day = SCHED.days.find((d) => d.id === set.day)
	$('#sheetImg').style.backgroundImage = a?.img ? `url(${a.img})` : 'none'
	$('#sheetImg').classList.toggle('no-img', !a?.img)
	$('#sheetArtist').textContent = set.artist
	$('#sheetGenre').textContent = a?.g || ''
	$('#sheetGenre').hidden = !a?.g
	$('#sheetDesc').textContent = a?.d || ''
	$('#sheetWhen').textContent =
		`${day.full} · ${set.start ? fmtTime(set.start) : 'TBA'}${set.end ? '–' + fmtTime(set.end) : ''}`
	const tag = $('#sheetStage')
	tag.textContent = set.stage.name
	tag.style.color = set.stage.color
	const fav = $('#sheetFav')
	fav.textContent = state.favs.has(set.id) ? '★ In My Roo' : '☆ Add to My Roo'
	fav.classList.toggle('faved', state.favs.has(set.id))
	$('#sheetSpotify').href = a?.id
		? `https://open.spotify.com/artist/${a.id}`
		: `https://open.spotify.com/search/${encodeURIComponent(set.artist)}`
	$('#sheetWrap').hidden = false
	document.body.style.overflow = 'hidden'
}

function closeSheet() {
	$('#sheetWrap').hidden = true
	document.body.style.overflow = ''
	sheetSet = null
}

$('#sheetClose').addEventListener('click', closeSheet)
$('#sheetWrap').addEventListener('click', (e) => {
	if (e.target.id === 'sheetWrap') closeSheet()
})
$('#sheetFav').addEventListener('click', () => {
	if (!sheetSet) return
	const keep = sheetSet
	toggleFav(keep)
	openSheet(keep) // refresh sheet button state
	renderSched()
})
$('#sheetMap').addEventListener('click', async () => {
	if (!sheetSet) return
	const poi = POIS.pois.find((p) => p.cat === 'stage' && p.stage === sheetSet.stage.id)
	closeSheet()
	setTab('map')
	await initMap()
	if (map && poi) {
		map.flyTo([poi.lat, poi.lon], 17)
		stageMarkers[poi.stage]?.openPopup()
	}
})

// ───────────────────────── my plan ─────────────────────────
function renderFavCount() {
	const b = $('#favCount')
	b.hidden = state.favs.size === 0
	b.textContent = state.favs.size
}

function renderPlan() {
	const body = $('#planBody')
	const favs = SETS.filter((s) => state.favs.has(s.id))
	if (!favs.length) {
		body.replaceChildren(
			el(
				'div',
				{ class: 'empty-note' },
				'No sets saved yet. Tap the ☆ next to any set in the schedule to build your weekend.',
			),
		)
		return
	}
	const frag = document.createDocumentFragment()
	for (const d of SCHED.days) {
		const daySets = favs.filter((s) => s.day === d.id)
		if (!daySets.length) continue
		frag.append(el('div', { class: 'plan-day-h' }, d.full.toUpperCase()))
		for (let i = 0; i < daySets.length; i++) {
			frag.append(setRow(daySets[i]))
			const next = daySets[i + 1]
			if (next && daySets[i].endMs && next.startMs && next.startMs < daySets[i].endMs) {
				frag.append(
					el(
						'div',
						{ class: 'conflict-note' },
						'⚠️',
						`Overlaps with ${next.artist} — you'll have to choose (or split it)`,
					),
				)
			}
		}
	}
	body.replaceChildren(frag)
}

$('#clearPlan').addEventListener('click', () => {
	if (!state.favs.size) return toast('Nothing to clear')
	if (!confirm('Remove all saved sets from My Roo?')) return
	state.favs.clear()
	saveFavs()
	renderFavCount()
	renderPlan()
	renderSched()
})

$('#sharePlan').addEventListener('click', async () => {
	const favs = SETS.filter((s) => state.favs.has(s.id))
	if (!favs.length) return toast('Star some sets first!')
	let txt = "My Bonnaroo '26 plan 🌈\n"
	for (const d of SCHED.days) {
		const daySets = favs.filter((s) => s.day === d.id)
		if (!daySets.length) continue
		txt += `\n${d.full}\n`
		for (const s of daySets)
			txt += `  ${s.start ? fmtTime(s.start) : 'TBA'} — ${s.artist} (${s.stage.name})\n`
	}
	txt += '\nvia cade.io/roo26'
	try {
		if (navigator.share) await navigator.share({ text: txt })
		else {
			await navigator.clipboard.writeText(txt)
			toast('Plan copied to clipboard')
		}
	} catch {}
})

// ───────────────────────── map ─────────────────────────
const POI_CATS = {
	stage: { label: 'Stages', emoji: '🎪', color: '#ff4f7b', on: true },
	water: { label: 'Water', emoji: '💧', color: '#46b3ff', on: true },
	medical: { label: 'Medical', emoji: '⛑️', color: '#ff5252', on: true },
	entrance: { label: 'Entrances', emoji: '🚪', color: '#ffb02e', on: true },
	food: { label: 'Food & shops', emoji: '🍕', color: '#3ddc97', on: false },
	utility: { label: 'Restrooms & misc', emoji: '🚻', color: '#8fa3ad', on: false },
	camping: { label: 'Camping', emoji: '⛺', color: '#b08bff', on: false },
	landmark: { label: 'Landmarks', emoji: '🎡', color: '#ff8bd2', on: true },
}

let L = null // leaflet module, loaded lazily on first map view
let map = null
const catLayers = {}
const stageMarkers = {}
let pinLayer = null
let userMarker = null
let userCircle = null
let watchId = null
let retryTimer = null

async function loadLeaflet() {
	if (L) return L
	const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
	L = mod.default
	return L
}

async function initMap() {
	if (map) {
		setTimeout(() => map.invalidateSize(), 60)
		return
	}
	try {
		await loadLeaflet()
	} catch {
		toast('Map failed to load — check your connection')
		return
	}

	const sat = L.tileLayer(
		'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
		{ maxZoom: 19, attribution: 'Imagery © Esri' },
	)
	const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '© OpenStreetMap',
	})

	map = L.map('map', {
		center: POIS.center,
		zoom: 16,
		layers: [sat],
		zoomControl: false,
		maxBounds: L.latLngBounds(POIS.farmBounds).pad(0.6),
		attributionControl: true,
	})
	let satOn = true
	$('#fabLayers').addEventListener('click', () => {
		satOn = !satOn
		map.removeLayer(satOn ? street : sat)
		map.addLayer(satOn ? sat : street)
	})

	// build category layers + markers
	for (const cat of Object.keys(POI_CATS)) catLayers[cat] = L.layerGroup()
	for (const p of POIS.pois) {
		const cat = POI_CATS[p.cat] || POI_CATS.landmark
		const isStage = p.cat === 'stage'
		const stageColor = p.stage && STAGES[p.stage] ? STAGES[p.stage].color : cat.color
		const size = isStage ? 34 : 26
		const m = L.marker([p.lat, p.lon], {
			icon: L.divIcon({
				className: '',
				html: `<div class="poi-pin ${isStage ? 'poi-stage' : ''}" style="--pc:${stageColor}">${p.emoji || cat.emoji}</div>`,
				iconSize: [size, size],
				iconAnchor: [size / 2, size / 2],
			}),
		})
		m.bindTooltip(p.name, {
			permanent: true,
			direction: 'bottom',
			offset: [0, size / 2 + 1],
			className: 'poi-lbl' + (isStage ? '' : ' lbl-minor'),
		})
		m.bindPopup(() => poiPopup(p))
		m.addTo(catLayers[p.cat] ? catLayers[p.cat] : catLayers.landmark)
		if (isStage) stageMarkers[p.stage] = m
	}
	for (const [cat, def] of Object.entries(POI_CATS)) if (def.on) catLayers[cat].addTo(map)

	pinLayer = L.layerGroup().addTo(map)
	drawPins()

	const syncZoomClass = () => $('#map').classList.toggle('map-zoomed-out', map.getZoom() < 17)
	map.on('zoomend', syncZoomClass)
	syncZoomClass()

	map.on('click', (e) => {
		if (state.placing) placePin(e.latlng.lat, e.latlng.lng)
	})

	renderPoiChips()
	setTimeout(() => map.invalidateSize(), 60)

	// auto-locate: resume if the user had it on, or if permission is already granted
	if (state.locatePref === true) startLocate(true)
	else if (state.locatePref !== false && navigator.permissions?.query) {
		navigator.permissions
			.query({ name: 'geolocation' })
			.then((p) => {
				if (p.state === 'granted') startLocate(true)
			})
			.catch(() => {})
	}
}

// popups show description + what's on now / next at stages
function poiPopup(p) {
	const wrap = el('div', {}, el('b', {}, p.name))
	if (p.desc) wrap.append(el('div', { class: 'pop-desc' }, p.desc))
	if (p.cat === 'stage' && p.stage) {
		const now = Date.now()
		const stageSets = SETS.filter((s) => s.stage.id === p.stage)
		const live = stageSets.find((s) => setStatus(s, now) === 'live')
		const next = stageSets.find((s) => s.startMs && s.startMs > now)
		if (live)
			wrap.append(
				el('div', { class: 'pop-now' }, `▶ NOW: ${live.artist} (until ${fmtTime(live.end)})`),
			)
		if (next)
			wrap.append(el('div', { class: 'pop-next' }, `next: ${next.artist} · ${fmtTime(next.start)}`))
		if (!live && !next) wrap.append(el('div', { class: 'pop-next' }, 'no more sets here — 🌈'))
	}
	return wrap
}

function renderPoiChips() {
	const wrap = $('#poiChips')
	wrap.replaceChildren(
		...Object.entries(POI_CATS).map(([id, def]) => {
			const c = el(
				'button',
				{ class: 'chip' + (def.on ? ' active' : ''), style: `--chip-c:${def.color}` },
				def.emoji + ' ' + def.label,
			)
			c.addEventListener('click', () => {
				def.on = !def.on
				if (map) (def.on ? catLayers[id].addTo(map) : catLayers[id].remove())
				renderPoiChips()
			})
			return c
		}),
	)
}

// — custom pins: mark your camp, friends' camps, meetup spots —
const PIN_EMOJIS = ['⛺', '🏕️', '🚐', '🍻', '🔥', '⭐', '🪩', '🦄', '🍄', '💀', '🎈', '🚩']
let pinEmoji = '⛺'

function openPinSheet() {
	$('#pinName').value = ''
	pinEmoji = '⛺'
	renderPinEmojis()
	$('#pinSheetWrap').hidden = false
}

function renderPinEmojis() {
	$('#pinEmojis').replaceChildren(
		...PIN_EMOJIS.map((e) => {
			const b = el('button', { class: 'pin-emoji' + (e === pinEmoji ? ' active' : '') }, e)
			b.addEventListener('click', () => {
				pinEmoji = e
				renderPinEmojis()
			})
			return b
		}),
	)
}

$('#fabPin').addEventListener('click', () => {
	if (!map) return toast('Wait for the map to load first')
	openPinSheet()
})
$('#pinSheetWrap').addEventListener('click', (e) => {
	if (e.target.id === 'pinSheetWrap') $('#pinSheetWrap').hidden = true
})
$('#pinCancel').addEventListener('click', () => ($('#pinSheetWrap').hidden = true))
$('#pinPlace').addEventListener('click', () => {
	state.placing = { emoji: pinEmoji, name: $('#pinName').value.trim() || 'My camp' }
	$('#pinSheetWrap').hidden = true
	$('#tentBanner').textContent = `Tap the map to place ${state.placing.emoji} ${state.placing.name}`
	$('#tentBanner').hidden = false
})
$('#pinHere').addEventListener('click', () => {
	if (!state.pos) return toast('Turn on 📍 location first')
	state.placing = { emoji: pinEmoji, name: $('#pinName').value.trim() || 'My camp' }
	$('#pinSheetWrap').hidden = true
	placePin(state.pos.lat, state.pos.lon)
})

function placePin(lat, lon) {
	const pin = {
		id: 'pin-' + Date.now(),
		emoji: state.placing.emoji,
		name: state.placing.name,
		lat,
		lon,
	}
	state.pins.push(pin)
	savePins()
	state.placing = null
	$('#tentBanner').hidden = true
	drawPins()
	toast(`${pin.emoji} ${pin.name} saved`)
	renderNearest()
}

function drawPins() {
	if (!map || !pinLayer) return
	pinLayer.clearLayers()
	for (const pin of state.pins) {
		const m = L.marker([pin.lat, pin.lon], {
			draggable: true,
			icon: L.divIcon({
				className: '',
				html: `<div class="camp-pin">${pin.emoji}</div>`,
				iconSize: [34, 34],
				iconAnchor: [17, 28],
			}),
		}).addTo(pinLayer)
		m.bindTooltip(pin.name, {
			permanent: true,
			direction: 'bottom',
			offset: [0, 8],
			className: 'poi-lbl',
		})
		m.bindPopup(() => {
			const rename = el('button', { class: 'pop-btn' }, 'Rename')
			rename.addEventListener('click', () => {
				const name = prompt('Pin name:', pin.name)
				if (name?.trim()) {
					pin.name = name.trim()
					savePins()
					drawPins()
					renderNearest()
				}
			})
			const rm = el('button', { class: 'pop-btn pop-btn-danger' }, 'Remove')
			rm.addEventListener('click', () => {
				state.pins = state.pins.filter((p) => p.id !== pin.id)
				savePins()
				drawPins()
				toast(`${pin.emoji} ${pin.name} removed`)
				renderNearest()
			})
			return el('div', {}, el('b', {}, `${pin.emoji} ${pin.name}`), el('br'), rename, ' ', rm)
		})
		m.on('dragend', () => {
			const ll = m.getLatLng()
			pin.lat = ll.lat
			pin.lon = ll.lng
			savePins()
			renderNearest()
		})
	}
}

// — geolocation: sticky, self-healing —
function haversine(a, b) {
	const R = 6371000
	const dLat = ((b.lat - a.lat) * Math.PI) / 180
	const dLon = ((b.lon - a.lon) * Math.PI) / 180
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
	return 2 * R * Math.asin(Math.sqrt(s))
}

const fmtDist = (m) =>
	m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1609.34).toFixed(1)} mi`
const fmtWalk = (m) => {
	const min = Math.max(1, Math.round(m / 80)) // ~3 mph festival shuffle
	return min > 90 ? '' : `~${min} min walk`
}

function startLocate(auto = false) {
	if (!('geolocation' in navigator)) return toast('No location support on this device')
	if (watchId != null) return
	clearTimeout(retryTimer)
	$('#fabLocate').classList.add('on')
	if (!auto) {
		store.set('locate', true)
		state.locatePref = true
	}
	let hadFix = !!state.pos
	watchId = navigator.geolocation.watchPosition(
		(p) => {
			const first = !hadFix
			hadFix = true
			state.pos = {
				lat: p.coords.latitude,
				lon: p.coords.longitude,
				acc: p.coords.accuracy,
				at: Date.now(),
			}
			drawUser()
			renderNearest()
			if (first) {
				const far = haversine(state.pos, { lat: POIS.center[0], lon: POIS.center[1] })
				if (far < 30000) map?.flyTo([state.pos.lat, state.pos.lon], Math.max(map.getZoom(), 16))
				else toast(`You're ${fmtDist(far)} from the Farm — map stays put`)
			}
		},
		(err) => {
			if (err.code === 1) {
				// permission denied — a retry loop would just nag
				stopLocate(true)
				toast('Location permission denied — enable it in browser settings')
				return
			}
			// signal lost / timeout: keep the last fix, mark it stale, quietly retry
			if (watchId != null) navigator.geolocation.clearWatch(watchId)
			watchId = null
			userMarker?.getElement()?.querySelector('.user-dot')?.classList.add('stale')
			retryTimer = setTimeout(() => startLocate(true), 8000)
		},
		{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
	)
}

function stopLocate(silent = false) {
	clearTimeout(retryTimer)
	if (watchId != null) navigator.geolocation.clearWatch(watchId)
	watchId = null
	state.pos = null
	$('#fabLocate').classList.remove('on')
	if (!silent) {
		store.set('locate', false)
		state.locatePref = false
	}
	if (userMarker) {
		userMarker.remove()
		userMarker = null
	}
	if (userCircle) {
		userCircle.remove()
		userCircle = null
	}
	renderNearest()
}

$('#fabLocate').addEventListener('click', () => (watchId == null ? startLocate() : stopLocate()))

// if the tab was backgrounded (screen off in a pocket), re-arm the watch
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) {
		refreshStatuses()
		if (map && state.locatePref === true && watchId == null) startLocate(true)
	}
})

function drawUser() {
	if (!map || !state.pos) return
	const ll = [state.pos.lat, state.pos.lon]
	if (!userMarker) {
		userMarker = L.marker(ll, {
			icon: L.divIcon({
				className: '',
				html: '<div class="user-dot"></div>',
				iconSize: [18, 18],
				iconAnchor: [9, 9],
			}),
			zIndexOffset: 1000,
		}).addTo(map)
		userCircle = L.circle(ll, {
			radius: state.pos.acc,
			color: '#46b3ff',
			weight: 1,
			fillOpacity: 0.12,
		}).addTo(map)
	} else {
		userMarker.setLatLng(ll)
		userCircle.setLatLng(ll).setRadius(state.pos.acc)
	}
	userMarker.getElement()?.querySelector('.user-dot')?.classList.remove('stale')
}

function renderNearest() {
	const hint = $('#nearestHint')
	const list = $('#nearestList')
	if (!state.pos) {
		hint.hidden = false
		list.replaceChildren()
		return
	}
	hint.hidden = true
	const targets = [
		...state.pins.map((p) => ({ name: p.name, emoji: p.emoji, lat: p.lat, lon: p.lon })),
		...POIS.pois.filter((p) => ['stage', 'water', 'medical'].includes(p.cat)),
	]
	const rows = targets
		.map((t) => ({ ...t, dist: haversine(state.pos, t) }))
		.sort((a, b) => a.dist - b.dist)
		.slice(0, 9)
	list.replaceChildren(
		...rows.map((r) =>
			el(
				'div',
				{ class: 'near-row' },
				el('span', { class: 'near-ico' }, r.emoji || POI_CATS[r.cat]?.emoji || '📍'),
				el('span', { class: 'near-name' }, r.name),
				el('span', { class: 'near-dist' }, fmtDist(r.dist)),
				el('span', { class: 'near-walk' }, fmtWalk(r.dist)),
			),
		),
	)
}

// — official map viewer (pinch-zoom over the official festival map images) —
const OMAPS = {
	centeroo: {
		src: '/roo26-map-centeroo.webp',
		w: 3200,
		h: 2005,
		note: 'Heads up: the official Centeroo map is printed SOUTH-UP — north is down.',
	},
	outeroo: {
		src: '/roo26-map-outeroo.webp',
		w: 3200,
		h: 2038,
		note: 'Campgrounds, Plazas 1–9, tolls and day parking.',
	},
}
let omap = null
let omapOverlay = null

async function openOmap(which = 'centeroo') {
	$('#omapWrap').hidden = false
	document.body.style.overflow = 'hidden'
	try {
		await loadLeaflet()
	} catch {
		toast('Could not load the viewer')
		return
	}
	const def = OMAPS[which]
	const bounds = [
		[0, 0],
		[def.h, def.w],
	]
	if (!omap) {
		omap = L.map('omapMap', {
			crs: L.CRS.Simple,
			minZoom: -3,
			maxZoom: 2,
			zoomControl: false,
			attributionControl: false,
		})
	}
	if (omapOverlay) omapOverlay.remove()
	omapOverlay = L.imageOverlay(def.src, bounds).addTo(omap)
	omap.setMaxBounds(L.latLngBounds(bounds).pad(0.2))
	omap.fitBounds(bounds)
	$('#omapNote').textContent = def.note
	$$('#omapTabs button').forEach((b) => b.classList.toggle('active', b.dataset.omap === which))
	setTimeout(() => omap.invalidateSize(), 60)
}

$('#fabOmap').addEventListener('click', () => openOmap('centeroo'))
$('#omapClose').addEventListener('click', () => {
	$('#omapWrap').hidden = true
	document.body.style.overflow = ''
})
$$('#omapTabs button').forEach((b) => b.addEventListener('click', () => openOmap(b.dataset.omap)))

// ───────────────────────── weather + alerts ─────────────────────────
const WX_POINT = `${POIS.center[0].toFixed(4)},${POIS.center[1].toFixed(4)}`
let weatherLoaded = false

async function loadWeather() {
	if (weatherLoaded) return
	weatherLoaded = true
	const box = $('#weatherDays')
	try {
		const cached = JSON.parse(sessionStorage.getItem('roo26:wx') || 'null')
		if (cached && Date.now() - cached.at < 30 * 60e3) return renderWeather(cached.periods, 'NWS live')
		const pt = await (await fetch(`https://api.weather.gov/points/${WX_POINT}`)).json()
		const fc = await (await fetch(pt.properties.forecast)).json()
		const periods = fc.properties.periods.slice(0, 8).map((p) => ({
			name: p.name,
			temp: p.temperature + '°' + p.temperatureUnit,
			short: p.shortForecast,
			rain: p.probabilityOfPrecipitation?.value ?? null,
		}))
		sessionStorage.setItem('roo26:wx', JSON.stringify({ at: Date.now(), periods }))
		renderWeather(periods, 'NWS live')
	} catch {
		if (window.ROO_WX_FALLBACK) renderWeather(window.ROO_WX_FALLBACK, 'cached forecast')
		else box.textContent = 'Forecast unavailable offline — check the NWS app.'
	}
}

function renderWeather(periods, src) {
	$('#weatherSrc').textContent = src
	$('#weatherDays').replaceChildren(
		...periods.map((p) =>
			el(
				'div',
				{ class: 'wx-day' },
				el('div', { class: 'wx-n' }, p.name),
				el('div', { class: 'wx-t' }, p.temp),
				el('div', { class: 'wx-d' }, p.short),
				p.rain != null && p.rain > 0 ? el('div', { class: 'wx-r' }, `💧 ${p.rain}% rain`) : null,
			),
		),
	)
}

// active NWS alerts (storms!) — banner above everything, dismissible per-alert
async function loadAlerts() {
	try {
		const res = await (await fetch(`https://api.weather.gov/alerts/active?point=${WX_POINT}`)).json()
		const dismissed = new Set(JSON.parse(sessionStorage.getItem('roo26:wxdismiss') || '[]'))
		const alerts = (res.features || [])
			.map((f) => f.properties)
			.filter((p) => ['Severe', 'Extreme', 'Moderate'].includes(p.severity) && !dismissed.has(p.id))
		const bar = $('#wxAlert')
		if (!alerts.length) {
			bar.hidden = true
			return
		}
		const a = alerts[0]
		$('#wxAlertText').textContent = `⚠️ ${a.event}${a.headline ? ' — ' + a.headline : ''}`
		bar.hidden = false
		$('#wxAlertClose').onclick = () => {
			dismissed.add(a.id)
			sessionStorage.setItem('roo26:wxdismiss', JSON.stringify([...dismissed]))
			bar.hidden = true
			loadAlerts()
		}
	} catch {}
}

// ───────────────────────── help & install ─────────────────────────
let deferredInstall = null
window.addEventListener('beforeinstallprompt', (e) => {
	e.preventDefault()
	deferredInstall = e
	$('#installBtn').hidden = false
})

$('#installBtn').addEventListener('click', async () => {
	if (!deferredInstall) return
	deferredInstall.prompt()
	await deferredInstall.userChoice
	deferredInstall = null
	$('#installBtn').hidden = true
})

function closeHelp() {
	$('#helpWrap').hidden = true
	document.body.style.overflow = ''
}
$('#helpBtn').addEventListener('click', () => {
	const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone
	$('#iosInstall').hidden = !ios || !!deferredInstall
	$('#helpWrap').hidden = false
	document.body.style.overflow = 'hidden'
})
$('#helpClose').addEventListener('click', closeHelp)
$('#helpWrap').addEventListener('click', (e) => {
	if (e.target.id === 'helpWrap') closeHelp()
})

// ───────────────────────── boot ─────────────────────────
renderDayTabs()
renderStageChips()
renderPoiChips()
renderSched()
renderNowStrip()
renderPill()
renderFavCount()
setTab(state.tab, false)
loadAlerts()

setInterval(refreshStatuses, 30e3)
setInterval(loadAlerts, 10 * 60e3)

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/roo26-sw.js').catch(() => {})
}
