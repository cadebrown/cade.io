// Advanced Secret Hitler — client.
//
// Zero backend to configure: players find each other and pass messages over a
// public MQTT broker (peer-to-peer), so there's nothing to bind or provision.
// The one job that needs a neutral party — shuffling roles so the host can't
// see them — is a stateless call to /secret-hitler-api/deal, which stores
// nothing and returns each card already encrypted to its recipient.
//
// The only secret that matters — this device's RSA private key — is generated
// here and kept in localStorage; it never leaves the device. We broadcast only
// the public key. Cards travel as ciphertext, so the broker, the dealer, the
// host, and every other player only ever handle things they can't read.

const BASE = '/secret-hitler-api'
const $ = (sel) => document.querySelector(sel)
const SESSION_KEY = 'sh.session.v2'

// Public MQTT-over-WebSockets brokers, tried in order. No account needed; these
// are the standard public test brokers. Payloads are E2E-encrypted, so a broker
// only ever relays ciphertext + public keys + lobby names. (window.SH_BROKERS
// lets a test harness point at a local broker.)
const BROKERS = window.SH_BROKERS || [
	'wss://broker.emqx.io:8084/mqtt',
	'wss://broker.hivemq.com:8884/mqtt',
]

// ── tiny helpers ─────────────────────────────────────────────
const postJSON = async (path, body) => {
	const res = await fetch(BASE + path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body || {}),
	})
	let data = null
	try {
		data = await res.json()
	} catch {}
	if (!res.ok) throw new Error(data?.error || `request failed (${res.status})`)
	return data
}
const b64ToBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
const esc = (s) =>
	String(s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
	)

const loadSession = () => {
	try {
		return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
	} catch {
		return null
	}
}
const saveSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s))
const clearSession = () => localStorage.removeItem(SESSION_KEY)

// ── crypto ───────────────────────────────────────────────────
const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' }
async function makeKeypair() {
	const kp = await crypto.subtle.generateKey(
		{ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) },
		true,
		['encrypt', 'decrypt']
	)
	return {
		pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
		privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
	}
}
async function decryptCard(blob, privJwk) {
	const priv = await crypto.subtle.importKey('jwk', privJwk, RSA, false, ['decrypt'])
	const rawAes = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64ToBuf(blob.encKey))
	const aesKey = await crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM' }, false, [
		'decrypt',
	])
	const pt = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: b64ToBuf(blob.iv) },
		aesKey,
		b64ToBuf(blob.ct)
	)
	return JSON.parse(new TextDecoder().decode(pt))
}
const cryptoOK = !!(window.crypto && crypto.subtle && window.isSecureContext)

const randId = (n, alphabet) => {
	const bytes = crypto.getRandomValues(new Uint8Array(n))
	let out = ''
	for (const b of bytes) out += alphabet[b % alphabet.length]
	return out
}
const newCode = () => randId(6, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789')
const newPid = () => randId(10, 'abcdefghijklmnopqrstuvwxyz0123456789')

// Official Secret Hitler distribution by player count (ordinary Fascists,
// excluding the single Hitler). The host can override this before dealing.
const OFFICIAL = {
	5: { fascists: 1, hitlerKnowsFascists: true },
	6: { fascists: 1, hitlerKnowsFascists: true },
	7: { fascists: 2, hitlerKnowsFascists: false },
	8: { fascists: 2, hitlerKnowsFascists: false },
	9: { fascists: 3, hitlerKnowsFascists: false },
	10: { fascists: 3, hitlerKnowsFascists: false },
}
const officialSetup = (n) => OFFICIAL[n] || { fascists: 1, hitlerKnowsFascists: n <= 6 }

// Resolve the distribution the host will deal, given the current player count.
// null fields fall back to the official value for that count; a host-set
// Fascist count is clamped so at least one Liberal always remains.
function resolvedSetup(count) {
	const off = officialSetup(count)
	let fascists = state.setup.fascists ?? off.fascists
	fascists = Math.max(1, Math.min(fascists, Math.max(1, count - 2)))
	const hitlerKnowsFascists = state.setup.hitlerKnowsFascists ?? off.hitlerKnowsFascists
	return { fascists, hitlerKnowsFascists }
}

// ── screen routing ───────────────────────────────────────────
const SCREENS = ['home', 'lobby', 'card']
function show(screen) {
	for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== screen
	window.scrollTo(0, 0)
}

// ── app state ────────────────────────────────────────────────
const state = {
	code: null,
	pid: null,
	name: null,
	isHost: false,
	privJwk: null,
	pubJwk: null,
	roster: new Map(), // pid -> { name, pubKey }
	status: 'lobby', // 'lobby' | 'dealt'
	dealId: null,
	seenDealId: null,
	card: null,
	client: null, // mqtt client
	connected: false,
	setup: { fascists: null, hitlerKnowsFascists: null }, // host's overrides (null = official)
	remoteSetup: null, // distribution the host published, for everyone to see
}

function setError(sel, msg) {
	const el = $(sel)
	if (!msg) return void (el.hidden = true)
	el.textContent = msg
	el.hidden = false
}
function setPill(text, cls) {
	const pill = $('#livePill')
	pill.textContent = text
	pill.className = 'live-pill ' + (cls || '')
}

// ── MQTT transport ───────────────────────────────────────────
const topic = (sub) => `cadeio/sh/${state.code}/${sub}`

async function connect() {
	setPill('connecting…', '')
	const mqtt = (await import('mqtt')).default
	const willTopic = `cadeio/sh/${state.code}/presence/${state.pid}`

	// Try brokers in order until one connects.
	const tryBroker = (i) =>
		new Promise((resolve, reject) => {
			if (i >= BROKERS.length) return reject(new Error('no broker reachable'))
			const client = mqtt.connect(BROKERS[i], {
				clientId:
					'sh-' + state.pid + '-' + randId(4, 'abcdefghijklmnopqrstuvwxyz0123456789'),
				clean: true,
				connectTimeout: 7000,
				reconnectPeriod: 2500,
				// clear our presence automatically if we drop
				will: { topic: willTopic, payload: '', qos: 1, retain: true },
			})
			let settled = false
			const bail = () => {
				if (settled) return
				settled = true
				try {
					client.end(true)
				} catch {}
				resolve(tryBroker(i + 1))
			}
			const timer = setTimeout(bail, 7500)
			client.once('connect', () => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(client)
			})
			client.once('error', bail)
		})

	const client = await tryBroker(0)
	state.client = client

	client.on('message', onMessage)
	client.on('connect', onConnect) // fires on first connect AND reconnects
	client.on('reconnect', () => {
		state.connected = false
		setPill('reconnecting…', '')
	})
	client.on('close', () => {
		state.connected = false
	})
	// kick the first subscribe/publish (the once('connect') above already fired)
	onConnect()
}

function onConnect() {
	state.connected = true
	setPill('connected', 'ok')
	const c = state.client
	if (!c) return
	// clean:true means subscriptions reset on every (re)connect
	c.subscribe(topic('presence/+'), { qos: 1 })
	c.subscribe(topic('state'), { qos: 1 })
	c.subscribe(topic('card/' + state.pid), { qos: 1 })
	publishPresence()
	if (state.isHost) publishState()
}

function pub(sub, obj, retain = true) {
	if (!state.client) return
	state.client.publish(sub.startsWith('cadeio/') ? sub : topic(sub), JSON.stringify(obj), {
		qos: 1,
		retain,
	})
}
function clearRetained(sub) {
	if (!state.client) return
	state.client.publish(topic(sub), '', { qos: 1, retain: true })
}

function publishPresence() {
	pub('presence/' + state.pid, { pid: state.pid, name: state.name, pubKey: state.pubJwk })
}
function publishState() {
	pub('state', {
		status: state.status,
		dealId: state.dealId,
		host: state.pid,
		setup: resolvedSetup(rosterList().length),
	})
}

function onMessage(t, payloadBuf) {
	const payload = payloadBuf.toString()
	const rel = t.replace(`cadeio/sh/${state.code}/`, '')

	if (rel.startsWith('presence/')) {
		const pid = rel.slice('presence/'.length)
		if (!payload) state.roster.delete(pid)
		else {
			try {
				const p = JSON.parse(payload)
				if (p && p.pid) state.roster.set(p.pid, { name: p.name, pubKey: p.pubKey })
			} catch {}
		}
		renderLobby()
		return
	}

	if (rel === 'state') {
		if (!payload) return
		let st
		try {
			st = JSON.parse(payload)
		} catch {
			return
		}
		state.status = st.status
		state.dealId = st.dealId
		if (st.setup) state.remoteSetup = st.setup
		if (!state.isHost) renderLobby()
		if (st.status === 'lobby') {
			state.card = null
			state.seenDealId = null
			ensureLobbyView()
			renderLobby()
		} else if (st.status === 'dealt') {
			// our card arrives on its own topic; if we already have it, show it
			if (state.card && state.seenDealId === st.dealId) enterCardScreen()
			else if (!state.card) $('#waitingHost').hidden = true
		}
		return
	}

	if (rel === 'card/' + state.pid) {
		if (!payload) return
		let msg
		try {
			msg = JSON.parse(payload)
		} catch {
			return
		}
		if (msg.dealId === state.seenDealId) return
		decryptCard(msg.blob, state.privJwk)
			.then((card) => {
				state.card = card
				state.seenDealId = msg.dealId
				buildCardFace(card)
				enterCardScreen()
			})
			.catch((e) => console.warn('could not open card', e))
		return
	}
}

// ── create / join ────────────────────────────────────────────
async function createGame() {
	const name = promptName()
	if (name == null) return
	const btn = $('#createBtn')
	btn.disabled = true
	btn.textContent = 'Creating…'
	try {
		const { pubJwk, privJwk } = await makeKeypair()
		Object.assign(state, {
			code: newCode(),
			pid: newPid(),
			name,
			isHost: true,
			pubJwk,
			privJwk,
			roster: new Map(),
			status: 'lobby',
			dealId: null,
			seenDealId: null,
			card: null,
		})
		saveSession(sessionBlob())
		await connect()
		enterLobby()
	} catch (e) {
		alert('Could not start the game: ' + e.message)
		setPill('offline', 'bad')
	} finally {
		btn.disabled = false
		btn.textContent = 'Create a game'
	}
}

async function joinGame(code, name) {
	setError('#joinErr', '')
	code = (code || '').toUpperCase().trim()
	if (!/^[A-Z0-9]{6}$/.test(code)) return setError('#joinErr', 'Enter the 6-character game code.')
	if (!name || !name.trim()) return setError('#joinErr', 'Enter your name.')
	const btn = $('#joinForm button')
	btn.disabled = true
	btn.textContent = 'Joining…'
	try {
		const { pubJwk, privJwk } = await makeKeypair()
		Object.assign(state, {
			code,
			pid: newPid(),
			name: name.trim(),
			isHost: false,
			pubJwk,
			privJwk,
			roster: new Map(),
			status: 'lobby',
			dealId: null,
			seenDealId: null,
			card: null,
		})
		saveSession(sessionBlob())
		await connect()
		enterLobby()
	} catch (e) {
		setError('#joinErr', 'Could not join: ' + e.message)
		setPill('offline', 'bad')
	} finally {
		btn.disabled = false
		btn.textContent = 'Join'
	}
}

function promptName() {
	const n = (prompt('Your name (shown to other players):') || '').trim()
	if (!n) return null
	return n.slice(0, 24)
}
const sessionBlob = () => ({
	code: state.code,
	pid: state.pid,
	name: state.name,
	isHost: state.isHost,
	pubJwk: state.pubJwk,
	privJwk: state.privJwk,
})

// ── lobby ────────────────────────────────────────────────────
function ensureLobbyView() {
	if (!$('#screen-lobby').hidden) return
	show('lobby')
	$('#lobbyCode').textContent = state.code
	$('#hostControls').hidden = !state.isHost
	$('#waitingHost').hidden = !!state.isHost
	renderQR()
}
function enterLobby() {
	ensureLobbyView()
	renderLobby()
}

async function renderQR() {
	const url = `${location.origin}/secret-hitler?g=${state.code}`
	try {
		const QR = (await import('qrcode')).default
		await QR.toCanvas($('#qr'), url, {
			width: 240,
			margin: 1,
			color: { dark: '#0d0b12', light: '#ffffff' },
		})
	} catch {
		$('#qr').hidden = true
	}
}

function rosterList() {
	// stable order: keep insertion order but ensure self present
	if (!state.roster.has(state.pid) && state.pid)
		state.roster.set(state.pid, { name: state.name, pubKey: state.pubJwk })
	return [...state.roster.entries()].map(([pid, v]) => ({ pid, ...v }))
}

function renderLobby() {
	if ($('#screen-lobby').hidden) return
	const players = rosterList()
	const list = $('#playersList')
	list.innerHTML = ''
	for (const p of players) {
		const li = document.createElement('li')
		const dot = document.createElement('span')
		dot.className = 'dot'
		const nm = document.createElement('span')
		nm.textContent = p.name
		li.append(dot, nm)
		if (p.pid === state.pid) {
			const me = document.createElement('span')
			me.className = 'me'
			me.textContent = 'you'
			li.append(me)
		}
		list.append(li)
	}
	const count = players.length
	$('#countPill').textContent = count
	$('#playersHint').textContent = '5–10 players'

	// distribution everyone can see: the host's is authoritative; others show
	// what the host published (falling back to official for the current count)
	const dist = state.isHost
		? resolvedSetup(count)
		: state.remoteSetup || officialSetup(Math.max(5, Math.min(10, count)))
	const libs = count - dist.fascists - 1
	$('#planLine').textContent =
		count >= 5
			? `This game: ${libs} Liberal · ${dist.fascists} Fascist · 1 Hitler${dist.hitlerKnowsFascists ? '' : ' · Hitler hidden'}`
			: ''

	if (state.isHost) {
		// sync the setup controls to the resolved distribution
		$('#fascCount').textContent = dist.fascists
		$('#fascMinus').disabled = dist.fascists <= 1
		$('#fascPlus').disabled = dist.fascists >= Math.max(1, count - 2)
		$('#hitlerKnows').checked = dist.hitlerKnowsFascists

		const withKeys = players.filter((p) => p.pubKey).length
		const ok = count >= 5 && count <= 10 && withKeys === count
		$('#dealBtn').disabled = !ok
		$('#dealHint').textContent =
			count < 5
				? `Need at least 5 players (have ${count}).`
				: count > 10
					? `Too many players (max 10).`
					: `Ready — deal ${libs} Liberal / ${dist.fascists} Fascist / 1 Hitler to ${count} players.`
	}
}

// Host adjusts the distribution, re-renders, and republishes so everyone's
// lobby updates.
function bumpFascists(delta) {
	const count = rosterList().length
	const cur = resolvedSetup(count).fascists
	state.setup.fascists = Math.max(1, Math.min(cur + delta, Math.max(1, count - 2)))
	renderLobby()
	publishState()
}
function setHitlerKnows(on) {
	state.setup.hitlerKnowsFascists = on
	renderLobby()
	publishState()
}
function resetSetup() {
	state.setup = { fascists: null, hitlerKnowsFascists: null }
	renderLobby()
	publishState()
}

// ── dealing (host) ───────────────────────────────────────────
async function deal() {
	const btn = $('#dealBtn')
	btn.disabled = true
	btn.textContent = 'Dealing…'
	try {
		const players = rosterList()
			.filter((p) => p.pubKey)
			.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey }))
		const setup = resolvedSetup(players.length)
		const { dealId, cards } = await postJSON('/deal', { players, setup })
		// relay each encrypted card to its player (retained so it's there for them)
		for (const [pid, blob] of Object.entries(cards)) pub('card/' + pid, { dealId, blob })
		state.status = 'dealt'
		state.dealId = dealId
		publishState()
	} catch (e) {
		alert('Deal failed: ' + e.message)
	} finally {
		btn.textContent = 'Deal roles'
		btn.disabled = false
	}
}

function backToLobby() {
	if (!confirm('Send everyone back to the lobby and clear the current roles?')) return
	// wipe retained cards for everyone we know about, then flip state
	for (const p of rosterList()) clearRetained('card/' + p.pid)
	state.status = 'lobby'
	state.dealId = null
	state.card = null
	state.seenDealId = null
	publishState()
	ensureLobbyView()
	renderLobby()
}

// ── card reveal ──────────────────────────────────────────────
function enterCardScreen() {
	show('card')
	resetReveal()
	$('#hostControlsCard').hidden = !state.isHost
}

const ROLE_ART = {
	liberal: { emoji: '🕊️', name: 'Liberal', klass: 'lib', party: 'Liberal Party' },
	fascist: { emoji: '🔥', name: 'Fascist', klass: 'fasc', party: 'Fascist Party' },
	hitler: { emoji: '☠️', name: 'Hitler', klass: 'fasc', party: 'Fascist Party' },
}

function buildCardFace(card) {
	const art = ROLE_ART[card.role]
	const face = $('#roleFace')
	const c = card.counts
	const countLine = `${c.players} players · ${c.liberals} Liberal · ${c.fascists} Fascist · 1 Hitler`

	let intel = ''
	if (card.role === 'liberal') {
		intel = `<div class="intel blind">You don't know anyone else's role. Win by enacting Liberal policies and keeping Hitler out of power.</div>`
	} else if (card.role === 'fascist') {
		const others = card.knows.fascists || []
		const otherLine = others.length
			? `<div><h4>Fellow Fascists</h4><div class="names">${others.map(esc).join(', ')}</div></div>`
			: `<div><h4>Fellow Fascists</h4><div class="names">— you're the only ordinary Fascist —</div></div>`
		intel = `<div class="intel"><div><h4>Hitler is</h4><div class="names">${esc(card.knows.hitler)}</div></div>${otherLine}</div>`
	} else if (card.role === 'hitler') {
		if (card.knows && card.knows.fascists) {
			intel = `<div class="intel"><h4>Your Fascist${card.knows.fascists.length > 1 ? 's' : ''}</h4><div class="names">${card.knows.fascists.map(esc).join(', ')}</div></div>`
		} else {
			intel = `<div class="intel blind">You don't know who your Fascists are. Keep your head down and get elected Chancellor.</div>`
		}
	}

	face.innerHTML = `
		<span class="role-emoji">${art.emoji}</span>
		<span class="party-label">${art.party}</span>
		<span class="role-name">${art.name}</span>
		${intel}
		<div class="counts">${countLine}</div>
		<div class="release-hint">Release to hide</div>`
	$('#roleCard').dataset.klass = art.klass
}

function doReveal(on) {
	const cardEl = $('#roleCard')
	if (!state.card) return
	$('#roleHidden').hidden = on
	$('#roleFace').hidden = !on
	cardEl.classList.toggle('revealed', on)
	cardEl.classList.toggle('lib', on && cardEl.dataset.klass === 'lib')
	cardEl.classList.toggle('fasc', on && cardEl.dataset.klass === 'fasc')
}
const resetReveal = () => doReveal(false)

// ── leave ────────────────────────────────────────────────────
function leaveGame() {
	if (!confirm('Leave this game?')) return
	try {
		clearRetained('presence/' + state.pid)
		state.client && state.client.end()
	} catch {}
	clearSession()
	Object.assign(state, {
		code: null,
		pid: null,
		name: null,
		isHost: false,
		privJwk: null,
		pubJwk: null,
		roster: new Map(),
		status: 'lobby',
		dealId: null,
		seenDealId: null,
		card: null,
		client: null,
		connected: false,
	})
	setPill('…', '')
	history.replaceState({}, '', '/secret-hitler')
	show('home')
}

// ── wire up ──────────────────────────────────────────────────
function wire() {
	$('#createBtn').addEventListener('click', createGame)
	$('#joinForm').addEventListener('submit', (e) => {
		e.preventDefault()
		joinGame($('#joinCode').value, $('#joinName').value)
	})
	$('#dealBtn').addEventListener('click', deal)
	$('#redealBtn').addEventListener('click', deal)
	$('#backLobbyBtn').addEventListener('click', backToLobby)
	$('#leaveBtn').addEventListener('click', leaveGame)
	$('#fascMinus').addEventListener('click', () => bumpFascists(-1))
	$('#fascPlus').addEventListener('click', () => bumpFascists(1))
	$('#hitlerKnows').addEventListener('change', (e) => setHitlerKnows(e.target.checked))
	$('#resetSetup').addEventListener('click', resetSetup)

	$('#copyBtn').addEventListener('click', async () => {
		const url = `${location.origin}/secret-hitler?g=${state.code}`
		const text = `Join my Secret Hitler game — code ${state.code}: ${url}`
		try {
			if (navigator.share) await navigator.share({ title: 'Secret Hitler', text, url })
			else {
				await navigator.clipboard.writeText(url)
				const b = $('#copyBtn')
				b.textContent = 'Copied!'
				setTimeout(() => (b.textContent = 'Copy link'), 1400)
			}
		} catch {}
	})

	const cardEl = $('#roleCard')
	const on = (e) => {
		e.preventDefault()
		doReveal(true)
	}
	const off = () => doReveal(false)
	cardEl.addEventListener('pointerdown', on)
	cardEl.addEventListener('pointerup', off)
	cardEl.addEventListener('pointerleave', off)
	cardEl.addEventListener('pointercancel', off)
	cardEl.addEventListener('contextmenu', (e) => e.preventDefault())

	// clean up our presence if the tab closes
	window.addEventListener('pagehide', () => {
		try {
			if (state.client && state.pid) clearRetained('presence/' + state.pid)
		} catch {}
	})

	const g = new URLSearchParams(location.search).get('g')
	if (g && /^[A-Za-z0-9]{6}$/.test(g)) $('#joinCode').value = g.toUpperCase()
}

// ── boot ─────────────────────────────────────────────────────
async function boot() {
	if (!cryptoOK) {
		setPill('needs https', 'bad')
		alert(
			'This dealer needs a secure (https) connection to generate the per-phone keys that keep roles private. Open it at https://cade.io/secret-hitler.'
		)
	}
	wire()

	// resume an in-progress game after a refresh
	const s = loadSession()
	if (cryptoOK && s && s.code && s.pid && s.privJwk) {
		Object.assign(state, {
			code: s.code,
			pid: s.pid,
			name: s.name,
			isHost: !!s.isHost,
			pubJwk: s.pubJwk,
			privJwk: s.privJwk,
			roster: new Map(),
		})
		try {
			await connect()
			enterLobby()
			return
		} catch {
			clearSession()
			setPill('offline', 'bad')
		}
	}
	show('home')
}

boot()
