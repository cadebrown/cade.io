// secret-hitler-api — leak-free secret-role dealer for cade.io/secret-hitler.
// Cloudflare Pages Functions; needs a KV namespace bound as SH_KV
// (Dashboard → Pages → cade-io → Settings → Bindings → KV namespace "SH_KV").
// Falls back to ROO_KV if SH_KV is not bound, so it works with the KV that
// already exists on this project. Until either is bound, /health reports
// ok:false and the app shows a "backend not configured" notice.
//
// Threat model — why nobody's roles leak:
//   Every phone generates an RSA-OAEP keypair on join and uploads ONLY its
//   public key. When the host deals, this function shuffles the roles in
//   memory, builds each player's private card (their role + exactly the
//   night-phase intel they're entitled to), and hybrid-encrypts that card to
//   the player's own public key. KV stores ONLY ciphertext — no plaintext
//   role, no name→role map, nothing readable. The server never returns
//   plaintext and cannot: it doesn't hold any private key. Every device may
//   fetch the whole blob of ciphertexts, but each can open only its own card.
//   The single moment plaintext exists is the in-memory shuffle during one
//   deal request; it is never stored, logged, or sent anywhere.
//
// State lives in KV under `sh:<code>:*` with a 6h TTL, so games self-clean.

const CODE_RE = /^[A-Z0-9]{6}$/
const PID_RE = /^[a-z0-9]{10}$/
const TTL = 60 * 60 * 6 // 6 hours
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no confusable chars (I,L,O,0,1)

// Official Secret Hitler setup by player count. `fasc` = ordinary Fascists
// (excludes Hitler). `hitlerKnowsFascists` is true only in 5–6 player games,
// where the night phase reveals the Fascist to Hitler.
const SETUP = {
	5: { fasc: 1, hitlerKnowsFascists: true },
	6: { fasc: 1, hitlerKnowsFascists: true },
	7: { fasc: 2, hitlerKnowsFascists: false },
	8: { fasc: 2, hitlerKnowsFascists: false },
	9: { fasc: 3, hitlerKnowsFascists: false },
	10: { fasc: 3, hitlerKnowsFascists: false },
}
const MIN_PLAYERS = 5
const MAX_PLAYERS = 10

const json = (data, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
	})

const randId = (n, alphabet) => {
	const bytes = crypto.getRandomValues(new Uint8Array(n))
	let out = ''
	for (const b of bytes) out += alphabet[b % alphabet.length]
	return out
}
const newCode = () => randId(6, CODE_ALPHABET)
const newPid = () => randId(10, 'abcdefghijklmnopqrstuvwxyz0123456789')
const newToken = () => randId(32, 'abcdefghijklmnopqrstuvwxyz0123456789')

async function sha256hex(str) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const b64 = (buf) => {
	let s = ''
	const bytes = new Uint8Array(buf)
	for (const byte of bytes) s += String.fromCharCode(byte)
	return btoa(s)
}

// Cryptographically shuffle in place (Fisher–Yates with a secure RNG).
function shuffle(arr) {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}
	return arr
}

// Hybrid-encrypt a JSON-able object to a player's RSA-OAEP public JWK:
// a fresh AES-GCM key encrypts the payload; RSA-OAEP wraps that AES key.
async function encryptTo(pubJwk, payload) {
	const pub = await crypto.subtle.importKey(
		'jwk',
		pubJwk,
		{ name: 'RSA-OAEP', hash: 'SHA-256' },
		false,
		['encrypt']
	)
	const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
	])
	const iv = crypto.getRandomValues(new Uint8Array(12))
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		aesKey,
		new TextEncoder().encode(JSON.stringify(payload))
	)
	const rawAes = await crypto.subtle.exportKey('raw', aesKey)
	const encKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, rawAes)
	return { v: 1, encKey: b64(encKey), iv: b64(iv), ct: b64(ct) }
}

const metaKey = (code) => `sh:${code}:meta`
const playerPrefix = (code) => `sh:${code}:player:`
const playerKey = (code, pid) => `sh:${code}:player:${pid}`
const cardKey = (code, pid) => `sh:${code}:card:${pid}`

async function loadMeta(kv, code) {
	return kv.get(metaKey(code), 'json')
}
async function loadPlayers(kv, code) {
	const list = await kv.list({ prefix: playerPrefix(code) })
	const players = (await Promise.all(list.keys.map((k) => kv.get(k.name, 'json')))).filter(
		Boolean
	)
	players.sort((a, b) => a.joinedAt - b.joinedAt)
	return players
}
const publicPlayers = (players) => players.map((p) => ({ pid: p.pid, name: p.name }))

export async function onRequest({ request, env, params }) {
	const kv = env.SH_KV || env.ROO_KV
	const parts = params.path || []
	const path = parts.join('/')

	if (path === 'health')
		return json({ ok: !!kv, minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS })
	if (!kv) return json({ error: 'backend not configured' }, 503)

	// POST /game — create a new game. Returns the join code and a host token.
	if (path === 'game' && request.method === 'POST') {
		let code
		for (let i = 0; i < 6; i++) {
			code = newCode()
			if (!(await loadMeta(kv, code))) break
		}
		const hostToken = newToken()
		const meta = {
			code,
			status: 'lobby',
			createdAt: Date.now(),
			hostHash: await sha256hex(hostToken),
			dealId: null,
			dealtAt: null,
			playerCount: 0,
		}
		await kv.put(metaKey(code), JSON.stringify(meta), { expirationTtl: TTL })
		return json({ code, hostToken })
	}

	// Everything below is /game/<code>/...
	const m = parts[0] === 'game' && CODE_RE.test(parts[1] || '') ? parts : null
	if (!m) return json({ error: 'not found' }, 404)
	const code = parts[1]
	const action = parts[2] || ''
	const meta = await loadMeta(kv, code)
	if (!meta) return json({ error: 'game not found or expired' }, 404)

	// GET /game/<code> — public lobby state (never any roles).
	if (!action && request.method === 'GET') {
		const players = await loadPlayers(kv, code)
		return json({
			code,
			status: meta.status,
			players: publicPlayers(players),
			count: players.length,
			dealId: meta.dealId,
			dealtAt: meta.dealtAt,
			// true when the roster changed since the last deal (host should re-deal)
			stale: meta.status === 'dealt' && players.length !== meta.playerCount,
			min: MIN_PLAYERS,
			max: MAX_PLAYERS,
		})
	}

	// POST /game/<code>/join — { name, pubKey } → { pid }
	if (action === 'join' && request.method === 'POST') {
		let body
		try {
			body = await request.json()
		} catch {
			return json({ error: 'bad json' }, 400)
		}
		const name = String(body?.name ?? '')
			.replace(/[\u0000-\u001f\u007f]/g, '')
			.trim()
			.slice(0, 24)
		if (!name) return json({ error: 'name required' }, 400)
		const pubKey = body?.pubKey
		if (!pubKey || pubKey.kty !== 'RSA' || typeof pubKey.n !== 'string')
			return json({ error: 'valid public key required' }, 400)

		const players = await loadPlayers(kv, code)
		if (players.length >= MAX_PLAYERS)
			return json({ error: 'game is full (10 players max)' }, 409)

		const pid = newPid()
		const player = { pid, name, pubKey, joinedAt: Date.now() }
		await kv.put(playerKey(code, pid), JSON.stringify(player), { expirationTtl: TTL })
		// keep the game alive as long as people are joining
		await kv.put(metaKey(code), JSON.stringify(meta), { expirationTtl: TTL })
		return json({ pid, name })
	}

	// POST /game/<code>/leave — { pid }
	if (action === 'leave' && request.method === 'POST') {
		let body
		try {
			body = await request.json()
		} catch {
			return json({ error: 'bad json' }, 400)
		}
		const pid = String(body?.pid ?? '')
		if (!PID_RE.test(pid)) return json({ error: 'bad pid' }, 400)
		await kv.delete(playerKey(code, pid))
		await kv.delete(cardKey(code, pid))
		return json({ ok: true })
	}

	// POST /game/<code>/deal — { hostToken } → shuffle + encrypt cards.
	if (action === 'deal' && request.method === 'POST') {
		let body
		try {
			body = await request.json()
		} catch {
			return json({ error: 'bad json' }, 400)
		}
		const hostToken = String(body?.hostToken ?? '')
		if ((await sha256hex(hostToken)) !== meta.hostHash)
			return json({ error: 'only the host can deal' }, 403)

		const players = await loadPlayers(kv, code)
		const n = players.length
		if (n < MIN_PLAYERS || n > MAX_PLAYERS)
			return json({ error: `need ${MIN_PLAYERS}–${MAX_PLAYERS} players (have ${n})` }, 400)

		const setup = SETUP[n]
		const order = shuffle([...players])
		const hitler = order[0]
		const regularFascists = order.slice(1, 1 + setup.fasc)
		const liberals = order.slice(1 + setup.fasc)
		const fascistPids = new Set([hitler.pid, ...regularFascists.map((p) => p.pid)])
		const counts = { players: n, liberals: liberals.length, fascists: setup.fasc, hitler: 1 }

		const dealId = randId(12, 'abcdefghijklmnopqrstuvwxyz0123456789')

		// Build + encrypt each player's private card to their own public key.
		await Promise.all(
			players.map(async (p) => {
				let card
				if (p.pid === hitler.pid) {
					card = {
						party: 'Fascist',
						role: 'hitler',
						counts,
						// In 5–6 player games Hitler learns the Fascist; otherwise nobody.
						knows: setup.hitlerKnowsFascists
							? { fascists: regularFascists.map((f) => f.name) }
							: null,
					}
				} else if (fascistPids.has(p.pid)) {
					card = {
						party: 'Fascist',
						role: 'fascist',
						counts,
						knows: {
							hitler: hitler.name,
							fascists: regularFascists
								.filter((f) => f.pid !== p.pid)
								.map((f) => f.name),
						},
					}
				} else {
					card = { party: 'Liberal', role: 'liberal', counts, knows: null }
				}
				const blob = await encryptTo(p.pubKey, card)
				await kv.put(cardKey(code, p.pid), JSON.stringify({ dealId, blob }), {
					expirationTtl: TTL,
				})
			})
		)

		const next = { ...meta, status: 'dealt', dealId, dealtAt: Date.now(), playerCount: n }
		await kv.put(metaKey(code), JSON.stringify(next), { expirationTtl: TTL })
		return json({ ok: true, dealId, count: n })
	}

	// POST /game/<code>/reset — { hostToken } → back to lobby, clear cards.
	if (action === 'reset' && request.method === 'POST') {
		let body
		try {
			body = await request.json()
		} catch {
			return json({ error: 'bad json' }, 400)
		}
		if ((await sha256hex(String(body?.hostToken ?? ''))) !== meta.hostHash)
			return json({ error: 'only the host can reset' }, 403)
		const players = await loadPlayers(kv, code)
		await Promise.all(players.map((p) => kv.delete(cardKey(code, p.pid))))
		const next = { ...meta, status: 'lobby', dealId: null, dealtAt: null, playerCount: 0 }
		await kv.put(metaKey(code), JSON.stringify(next), { expirationTtl: TTL })
		return json({ ok: true })
	}

	// GET /game/<code>/card/<pid> — the ciphertext for one player. Safe to be
	// public: only that player's private key (never sent to the server) opens it.
	if (action === 'card' && request.method === 'GET') {
		const pid = parts[3] || ''
		if (!PID_RE.test(pid)) return json({ error: 'bad pid' }, 400)
		if (meta.status !== 'dealt') return json({ error: 'not dealt yet' }, 404)
		const stored = await kv.get(cardKey(code, pid), 'json')
		if (!stored) return json({ error: 'no card for this player' }, 404)
		return json({ dealId: stored.dealId, blob: stored.blob })
	}

	return json({ error: 'not found' }, 404)
}
