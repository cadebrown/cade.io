// Integration test for the secret-hitler-api Pages Function: it drives the real
// onRequest handler through create → join → deal → fetch-card against a mock KV,
// then decrypts each card the way a player's phone would. It asserts the two
// properties that matter: (1) every player gets exactly the role info they're
// entitled to, and (2) no player can open another player's card.

import { describe, expect, it } from 'vitest'
// @ts-expect-error — Pages Function file has a bracketed name and no types
import { onRequest } from '../functions/secret-hitler-api/[[path]].js'

// Minimal in-memory stand-in for a Cloudflare KV namespace.
function mockKV() {
	const store = new Map<string, string>()
	return {
		async get(key: string, type?: string) {
			const v = store.get(key)
			if (v == null) return null
			return type === 'json' ? JSON.parse(v) : v
		},
		async put(key: string, value: string) {
			store.set(key, value)
		},
		async delete(key: string) {
			store.delete(key)
		},
		async list({ prefix }: { prefix: string }) {
			return {
				keys: [...store.keys()]
					.filter((k) => k.startsWith(prefix))
					.map((name) => ({ name })),
			}
		},
	}
}

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' } as const
const b64ToBuf = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

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
async function decryptCard(blob: any, privJwk: JsonWebKey) {
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

// Drive the handler like the router would: split the path into params.path[].
async function call(kv: any, method: string, path: string, body?: any) {
	const request = new Request('https://x/secret-hitler-api/' + path, {
		method,
		...(body
			? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
			: {}),
	})
	const res = await onRequest({ request, env: { SH_KV: kv }, params: { path: path.split('/') } })
	return { status: res.status, data: await res.json() }
}

async function playThrough(n: number) {
	const kv = mockKV()
	const created = await call(kv, 'POST', 'game')
	expect(created.status).toBe(200)
	const { code, hostToken } = created.data

	const players: any[] = []
	for (let i = 0; i < n; i++) {
		const kp = await makeKeypair()
		const joined = await call(kv, 'POST', `game/${code}/join`, {
			name: 'Player' + i,
			pubKey: kp.pubJwk,
		})
		expect(joined.status).toBe(200)
		players.push({ pid: joined.data.pid, name: 'Player' + i, privJwk: kp.privJwk })
	}

	const dealt = await call(kv, 'POST', `game/${code}/deal`, { hostToken })
	expect(dealt.status).toBe(200)

	// each player fetches + decrypts their own card
	const cards: Record<string, any> = {}
	for (const p of players) {
		const got = await call(kv, 'GET', `game/${code}/card/${p.pid}`)
		expect(got.status).toBe(200)
		cards[p.pid] = await decryptCard(got.data.blob, p.privJwk)
	}
	return { kv, code, players, cards }
}

describe('secret-hitler role dealer', () => {
	it('reports health and player bounds', async () => {
		const kv = mockKV()
		const { status, data } = await call(kv, 'GET', 'health')
		expect(status).toBe(200)
		expect(data.ok).toBe(true)
		expect(data.minPlayers).toBe(5)
		expect(data.maxPlayers).toBe(10)
	})

	it('refuses to deal with too few players', async () => {
		const kv = mockKV()
		const { data: g } = await call(kv, 'POST', 'game')
		for (let i = 0; i < 4; i++)
			await call(kv, 'POST', `game/${g.code}/join`, {
				name: 'P' + i,
				pubKey: (await makeKeypair()).pubJwk,
			})
		const res = await call(kv, 'POST', `game/${g.code}/deal`, { hostToken: g.hostToken })
		expect(res.status).toBe(400)
	})

	it('rejects a deal from a non-host', async () => {
		const kv = mockKV()
		const { data: g } = await call(kv, 'POST', 'game')
		for (let i = 0; i < 5; i++)
			await call(kv, 'POST', `game/${g.code}/join`, {
				name: 'P' + i,
				pubKey: (await makeKeypair()).pubJwk,
			})
		const res = await call(kv, 'POST', `game/${g.code}/deal`, { hostToken: 'not-the-host' })
		expect(res.status).toBe(403)
	})

	// Exhaustively check every supported table size.
	for (let n = 5; n <= 10; n++) {
		it(`deals a correct, leak-free ${n}-player game`, async () => {
			const { players, cards } = await playThrough(n)
			const expectFasc = n <= 6 ? 1 : n <= 8 ? 2 : 3
			const hitlerKnows = n <= 6

			const roles = players.map((p) => cards[p.pid].role)
			expect(roles.filter((r) => r === 'hitler').length).toBe(1)
			expect(roles.filter((r) => r === 'fascist').length).toBe(expectFasc)
			expect(roles.filter((r) => r === 'liberal').length).toBe(n - expectFasc - 1)

			const hitler = players.find((p) => cards[p.pid].role === 'hitler')!
			for (const p of players) {
				const c = cards[p.pid]
				if (c.role === 'liberal') {
					expect(c.knows).toBeNull() // liberals learn nothing
				} else if (c.role === 'fascist') {
					expect(c.knows.hitler).toBe(hitler.name) // fascists know Hitler
					expect(c.knows.fascists).not.toContain(p.name) // and never themselves
				} else {
					// Hitler sees Fascists only in 5–6 player games
					if (hitlerKnows) expect(c.knows.fascists.length).toBe(expectFasc)
					else expect(c.knows).toBeNull()
				}
			}
		})
	}

	it('never lets one player open another player’s card', async () => {
		const { kv, code, players } = await playThrough(7)
		const attacker = players[0]
		const victim = players[1]
		// The card endpoint is intentionally public — anyone can pull the ciphertext.
		const stolen = await call(kv, 'GET', `game/${code}/card/${victim.pid}`)
		expect(stolen.status).toBe(200)
		// But it's useless without the victim's private key: decryption must throw.
		await expect(decryptCard(stolen.data.blob, attacker.privJwk)).rejects.toThrow()
		// Sanity: the victim CAN open it.
		const opened = await decryptCard(stolen.data.blob, victim.privJwk)
		expect(['liberal', 'fascist', 'hitler']).toContain(opened.role)
	})
})
