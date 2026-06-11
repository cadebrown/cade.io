// _app.js — all client logic for the Roo '26 guide.
// Bundled by Astro; shared by /roo26, /roo26/map, /roo26/plan, /roo26/info.
import SCHED from './_data/schedule.json'
import POIS from './_data/pois.json'

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
}

const state = {
	tab: document.documentElement.dataset.tab || 'schedule',
	day: store.get('day', null) || currentFestDay() || SCHED.days[0].id,
	stage: 'all',
	search: '',
	favs: new Set(store.get('favs', [])),
	tent: store.get('tent', null),
	placingTent: false,
	pos: null, // latest geolocation fix {lat, lon, acc}
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
	const b = el(
		'button',
		{
			class: 'fav-btn' + (state.favs.has(set.id) ? ' faved' : ''),
			'aria-label': 'Add to my plan',
		},
		state.favs.has(set.id) ? '★' : '☆',
	)
	b.addEventListener('click', (e) => {
		e.stopPropagation()
		if (state.favs.has(set.id)) {
			state.favs.delete(set.id)
			toast(`Removed ${set.artist} from My Roo`)
		} else {
			state.favs.add(set.id)
			toast(`★ ${set.artist} added to My Roo`)
		}
		saveFavs()
		b.classList.toggle('faved', state.favs.has(set.id))
		b.textContent = state.favs.has(set.id) ? '★' : '☆'
		renderFavCount()
		if (state.tab === 'plan') renderPlan()
	})
	return b
}

function setRow(set) {
	const st = setStatus(set)
	return el(
		'div',
		{
			class: `set-row is-${st}`,
			style: `--sc:${set.stage.color}`,
			'data-id': set.id,
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
				st === 'live' ? el('span', { class: 'live-tag' }, 'LIVE') : null,
			),
		),
		favButton(set),
	)
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
			(!q || s.artist.toLowerCase().includes(q)),
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
			c.addEventListener('click', () => {
				state.day = s.day
				store.set('day', s.day)
				renderDayTabs()
				renderSched()
				$(`.set-row[data-id="${s.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
			})
			return c
		}),
	)
}

// refresh live/past classes in place without rebuilding (keeps scroll)
function refreshStatuses() {
	const now = Date.now()
	$$('#schedList .set-row').forEach((row) => {
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
		$('#schedList .set-row.is-live') || $$('#schedList .set-row').find((r) => !r.classList.contains('is-past'))
	if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
	else toast('No upcoming sets on this day')
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
		for (const s of daySets) txt += `  ${s.start ? fmtTime(s.start) : 'TBA'} — ${s.artist} (${s.stage.name})\n`
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
	camping: { label: 'Camping', emoji: '⛺', color: '#b08bff', on: false },
	landmark: { label: 'Landmarks', emoji: '🎡', color: '#ff8bd2', on: true },
}

let L = null // leaflet module, loaded lazily on first map view
let map = null
const catLayers = {}
let userMarker = null
let userCircle = null
let tentMarker = null
let watchId = null

async function initMap() {
	if (map) {
		setTimeout(() => map.invalidateSize(), 60)
		return
	}
	try {
		const [mod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')])
		L = mod.default
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
		m.bindPopup(`<b>${p.name}</b>${p.desc ? '<br>' + p.desc : ''}`)
		m.addTo(catLayers[p.cat] ? catLayers[p.cat] : catLayers.landmark)
	}
	for (const [cat, def] of Object.entries(POI_CATS)) if (def.on) catLayers[cat].addTo(map)

	const syncZoomClass = () =>
		$('#map').classList.toggle('map-zoomed-out', map.getZoom() < 17)
	map.on('zoomend', syncZoomClass)
	syncZoomClass()

	map.on('click', (e) => {
		if (state.placingTent) placeTent(e.latlng.lat, e.latlng.lng)
	})

	renderPoiChips()
	if (state.tent) drawTent()
	setTimeout(() => map.invalidateSize(), 60)
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

// — tent pin —
function placeTent(lat, lon) {
	state.tent = { lat, lon }
	store.set('tent', state.tent)
	state.placingTent = false
	$('#tentBanner').hidden = true
	$('#fabTent').classList.remove('on')
	drawTent()
	toast('⛺ Tent saved — find your way home later')
	renderNearest()
}

function drawTent() {
	if (!map || !state.tent) return
	if (tentMarker) tentMarker.remove()
	tentMarker = L.marker([state.tent.lat, state.tent.lon], {
		draggable: true,
		icon: L.divIcon({
			className: '',
			html: '<div class="tent-pin">⛺</div>',
			iconSize: [34, 34],
			iconAnchor: [17, 28],
		}),
	}).addTo(map)
	const pop = el(
		'div',
		{},
		el('b', {}, 'My tent'),
		el('br'),
		el('button', { class: 'pop-btn', onclick: removeTent }, 'Remove pin'),
	)
	tentMarker.bindPopup(pop)
	tentMarker.bindTooltip('My tent', {
		permanent: true,
		direction: 'bottom',
		offset: [0, 8],
		className: 'poi-lbl',
	})
	tentMarker.on('dragend', () => {
		const ll = tentMarker.getLatLng()
		state.tent = { lat: ll.lat, lon: ll.lng }
		store.set('tent', state.tent)
		renderNearest()
	})
}

function removeTent() {
	state.tent = null
	store.set('tent', null)
	if (tentMarker) {
		tentMarker.remove()
		tentMarker = null
	}
	toast('Tent pin removed')
	renderNearest()
}

$('#fabTent').addEventListener('click', () => {
	if (state.tent && !state.placingTent) {
		map?.flyTo([state.tent.lat, state.tent.lon], Math.max(map.getZoom(), 17))
		toast('That ⛺ is home — drag it to move, tap it to remove')
		return
	}
	state.placingTent = !state.placingTent
	$('#tentBanner').hidden = !state.placingTent
	$('#fabTent').classList.toggle('on', state.placingTent)
})

// — geolocation —
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

function startLocate() {
	if (!('geolocation' in navigator)) return toast('No location support on this device')
	$('#fabLocate').classList.add('on')
	let firstFix = true
	watchId = navigator.geolocation.watchPosition(
		(p) => {
			state.pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }
			drawUser()
			renderNearest()
			if (firstFix) {
				firstFix = false
				const far = haversine(state.pos, { lat: POIS.center[0], lon: POIS.center[1] })
				if (far < 30000) map.flyTo([state.pos.lat, state.pos.lon], Math.max(map.getZoom(), 16))
				else toast(`You're ${fmtDist(far)} from the Farm — map stays put`)
			}
		},
		(err) => {
			stopLocate()
			toast(
				err.code === 1
					? 'Location permission denied — enable it in your browser settings'
					: 'Could not get your location',
			)
		},
		{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
	)
}

function stopLocate() {
	if (watchId != null) navigator.geolocation.clearWatch(watchId)
	watchId = null
	state.pos = null
	$('#fabLocate').classList.remove('on')
	if (userMarker) (userMarker.remove(), (userMarker = null))
	if (userCircle) (userCircle.remove(), (userCircle = null))
	renderNearest()
}

$('#fabLocate').addEventListener('click', () => (watchId == null ? startLocate() : stopLocate()))

function drawUser() {
	if (!map || !state.pos) return
	const ll = [state.pos.lat, state.pos.lon]
	if (!userMarker) {
		userMarker = L.marker(ll, {
			icon: L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
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
		...(state.tent ? [{ name: 'My tent', emoji: '⛺', lat: state.tent.lat, lon: state.tent.lon }] : []),
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

// ───────────────────────── weather ─────────────────────────
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

// ───────────────────────── boot ─────────────────────────
renderDayTabs()
renderStageChips()
renderPoiChips()
renderSched()
renderNowStrip()
renderPill()
renderFavCount()
setTab(state.tab, false)

setInterval(refreshStatuses, 30e3)
document.addEventListener('visibilitychange', () => {
	if (!document.hidden) refreshStatuses()
})

if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('/roo26-sw.js').catch(() => {})
}
