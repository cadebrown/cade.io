// Advanced Secret Hitler — client. Talks to /secret-hitler-api.
//
// The only secret that matters — this device's RSA private key — is generated
// here and kept in localStorage; it never touches the network. We upload only
// the public key. Cards arrive as ciphertext and are decrypted locally, so the
// server (and everyone else) only ever sees things they can't read.

const BASE = '/secret-hitler-api'
const $ = (sel) => document.querySelector(sel)
const SESSION_KEY = 'sh.session.v1'

// ── tiny helpers ─────────────────────────────────────────────
const api = async (path, opts) => {
	const res = await fetch(BASE + path, opts)
	let data = null
	try {
		data = await res.json()
	} catch {}
	if (!res.ok) throw new Error(data?.error || `request failed (${res.status})`)
	return data
}
const postJSON = (path, body) =>
	api(path, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body || {}),
	})

const b64ToBuf = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

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
// Reverse of the server's encryptTo(): RSA-unwrap the AES key, AES-GCM-decrypt.
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
	hostToken: null, // set only for the host
	privJwk: null,
	card: null, // decrypted card, cached in memory once opened
	seenDealId: null,
	pollTimer: null,
}

function setError(sel, msg) {
	const el = $(sel)
	if (!msg) {
		el.hidden = true
		return
	}
	el.textContent = msg
	el.hidden = false
}

// ── health ───────────────────────────────────────────────────
async function checkHealth() {
	const pill = $('#livePill')
	try {
		const h = await api('/health')
		if (h.ok) {
			pill.textContent = 'ready'
			pill.className = 'live-pill ok'
		} else {
			pill.textContent = 'backend not configured'
			pill.className = 'live-pill bad'
		}
		return h.ok
	} catch {
		pill.textContent = 'offline'
		pill.className = 'live-pill bad'
		return false
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
		const { code, hostToken } = await postJSON('/game', {})
		const { pid } = await postJSON(`/game/${code}/join`, { name, pubKey: pubJwk })
		state.code = code
		state.pid = pid
		state.name = name
		state.hostToken = hostToken
		state.privJwk = privJwk
		state.card = null
		state.seenDealId = null
		saveSession({ code, pid, name, hostToken, privJwk })
		enterLobby()
	} catch (e) {
		alert('Could not create the game: ' + e.message)
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
		const { pid } = await postJSON(`/game/${code}/join`, { name: name.trim(), pubKey: pubJwk })
		state.code = code
		state.pid = pid
		state.name = name.trim()
		state.hostToken = null
		state.privJwk = privJwk
		state.card = null
		state.seenDealId = null
		saveSession({ code, pid, name: state.name, hostToken: null, privJwk })
		enterLobby()
	} catch (e) {
		setError('#joinErr', e.message)
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

// ── lobby ────────────────────────────────────────────────────
// Switch to the lobby view. Heavy setup (QR render) runs only on the actual
// transition, so the 2.5s poll can call this freely without redrawing.
function ensureLobbyView() {
	if (!$('#screen-lobby').hidden) return
	show('lobby')
	$('#lobbyCode').textContent = state.code
	$('#hostControls').hidden = !state.hostToken
	$('#waitingHost').hidden = !!state.hostToken
	renderQR()
}
function enterLobby() {
	ensureLobbyView()
	startPolling()
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

function renderLobby(data) {
	const list = $('#playersList')
	list.innerHTML = ''
	for (const p of data.players) {
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
	$('#countPill').textContent = data.count
	const { count, min, max } = data
	$('#playersHint').textContent = `${min}–${max} players`

	if (state.hostToken) {
		const dealBtn = $('#dealBtn')
		const ok = count >= min && count <= max
		dealBtn.disabled = !ok
		$('#dealHint').textContent = ok
			? `Ready — deal roles to all ${count} players.`
			: count < min
				? `Need at least ${min} players (have ${count}).`
				: `Too many players (max ${max}).`
	}
}

// ── dealing (host) ───────────────────────────────────────────
async function deal() {
	const btn = $('#dealBtn')
	btn.disabled = true
	btn.textContent = 'Dealing…'
	try {
		await postJSON(`/game/${state.code}/deal`, { hostToken: state.hostToken })
		// the poll loop will pick up the new dealId and pull our card
	} catch (e) {
		alert('Deal failed: ' + e.message)
	} finally {
		btn.textContent = 'Deal roles'
	}
}

async function reset() {
	if (!confirm('Send everyone back to the lobby and clear the current roles?')) return
	try {
		await postJSON(`/game/${state.code}/reset`, { hostToken: state.hostToken })
		state.card = null
		state.seenDealId = null
	} catch (e) {
		alert('Could not reset: ' + e.message)
	}
}

// ── card reveal ──────────────────────────────────────────────
async function loadCard(dealId) {
	try {
		const { blob } = await api(`/game/${state.code}/card/${state.pid}`)
		state.card = await decryptCard(blob, state.privJwk)
		state.seenDealId = dealId
		buildCardFace(state.card)
		enterCardScreen()
	} catch (e) {
		// card not ready or a stale key — surface softly and stay put
		console.warn('card load failed', e)
	}
}

function enterCardScreen() {
	show('card')
	resetReveal()
	const isHost = !!state.hostToken
	$('#hostControlsCard').hidden = !isHost
	$('#waitingRedeal').hidden = true
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
			intel = `<div class="intel blind">You don't know who your Fascists are — this is a ${c.players}-player game. Keep your head down and get elected Chancellor.</div>`
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

let revealed = false
function doReveal(on) {
	const cardEl = $('#roleCard')
	if (!state.card) return
	revealed = on
	$('#roleHidden').hidden = on
	$('#roleFace').hidden = !on
	cardEl.classList.toggle('revealed', on)
	cardEl.classList.toggle('lib', on && cardEl.dataset.klass === 'lib')
	cardEl.classList.toggle('fasc', on && cardEl.dataset.klass === 'fasc')
}
function resetReveal() {
	doReveal(false)
}

// ── polling loop ─────────────────────────────────────────────
function startPolling() {
	stopPolling()
	const tick = async () => {
		if (!state.code) return
		let data
		try {
			data = await api(`/game/${state.code}`)
		} catch (e) {
			// game vanished (expired) — bail to home
			if (String(e.message).includes('not found')) return leaveToHome()
			return
		}
		if (data.status === 'lobby') {
			// first load, or the host reset an in-progress game back to the lobby
			state.card = null
			state.seenDealId = null
			ensureLobbyView()
			renderLobby(data)
		} else if (data.status === 'dealt') {
			// a new deal we haven't opened yet → pull + decrypt our card
			if (data.dealId && data.dealId !== state.seenDealId) {
				await loadCard(data.dealId)
			}
			// host sees a hint when the roster changed since this deal
			if (state.hostToken && !$('#screen-card').hidden) {
				$('#staleHint').hidden = !data.stale
			}
		}
	}
	tick()
	state.pollTimer = setInterval(tick, 2500)
}
function stopPolling() {
	if (state.pollTimer) clearInterval(state.pollTimer)
	state.pollTimer = null
}

// ── leave / reset to home ────────────────────────────────────
async function leaveGame() {
	if (!confirm('Leave this game?')) return
	try {
		if (state.code && state.pid) await postJSON(`/game/${state.code}/leave`, { pid: state.pid })
	} catch {}
	leaveToHome()
}
function leaveToHome() {
	stopPolling()
	clearSession()
	Object.assign(state, {
		code: null,
		pid: null,
		name: null,
		hostToken: null,
		privJwk: null,
		card: null,
		seenDealId: null,
	})
	history.replaceState({}, '', '/secret-hitler')
	show('home')
}

const esc = (s) =>
	String(s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
	)

// ── wire up ──────────────────────────────────────────────────
function wire() {
	$('#createBtn').addEventListener('click', createGame)
	$('#joinForm').addEventListener('submit', (e) => {
		e.preventDefault()
		joinGame($('#joinCode').value, $('#joinName').value)
	})
	$('#dealBtn').addEventListener('click', deal)
	$('#redealBtn').addEventListener('click', deal)
	$('#backLobbyBtn').addEventListener('click', reset)
	$('#leaveBtn').addEventListener('click', leaveGame)

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

	// hold-to-reveal
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

	// prefill code from a shared ?g=CODE link
	const g = new URLSearchParams(location.search).get('g')
	if (g && /^[A-Za-z0-9]{6}$/.test(g)) $('#joinCode').value = g.toUpperCase()
}

// ── boot ─────────────────────────────────────────────────────
async function boot() {
	if (!cryptoOK) {
		$('#livePill').textContent = 'needs https'
		$('#livePill').className = 'live-pill bad'
		alert(
			'This dealer needs a secure (https) connection to generate the per-phone keys that keep roles private. Open it at https://cade.io/secret-hitler.'
		)
	}
	wire()
	const ok = await checkHealth()
	setInterval(checkHealth, 30000)

	// resume an in-progress game if we have a saved session that still exists
	const s = loadSession()
	if (ok && s && s.code && s.pid && s.privJwk) {
		try {
			const data = await api(`/game/${s.code}`)
			const stillIn = data.players.some((p) => p.pid === s.pid)
			if (stillIn) {
				Object.assign(state, {
					code: s.code,
					pid: s.pid,
					name: s.name,
					hostToken: s.hostToken || null,
					privJwk: s.privJwk,
				})
				enterLobby()
				return
			}
		} catch {}
		clearSession()
	}
	show('home')
}

boot()
