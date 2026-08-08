// Integration test for the stateless secret-hitler-api dealer. It drives the
// real onRequest handler with a submitted roster, then decrypts each returned
// card the way a player's phone would. It asserts the two properties that
// matter: (1) every player gets exactly the role info they're entitled to, and
// (2) a card is openable only with its owner's private key — not the host's,
// not anyone else's.

import { describe, expect, it } from 'vitest'
// @ts-expect-error — Pages Function file has a bracketed name and no types
import { onRequest } from '../functions/secret-hitler-api/[[path]].js'

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

async function call(method: string, path: string, body?: any) {
	const request = new Request('https://x/secret-hitler-api/' + path, {
		method,
		...(body
			? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
			: {}),
	})
	const res = await onRequest({ request, params: { path: path.split('/') } })
	return { status: res.status, data: await res.json() }
}

async function makePlayers(n: number) {
	const players = []
	for (let i = 0; i < n; i++) {
		const kp = await makeKeypair()
		players.push({
			pid: 'player' + i,
			name: 'Player' + i,
			pubKey: kp.pubJwk,
			privJwk: kp.privJwk,
		})
	}
	return players
}

async function dealTo(players: any[]) {
	const roster = players.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey }))
	const res = await call('POST', 'deal', { players: roster })
	expect(res.status).toBe(200)
	const cards: Record<string, any> = {}
	for (const p of players) cards[p.pid] = await decryptCard(res.data.cards[p.pid], p.privJwk)
	return { dealId: res.data.dealId, raw: res.data.cards, cards }
}

describe('secret-hitler stateless dealer', () => {
	it('reports health with no bindings required', async () => {
		const { status, data } = await call('GET', 'health')
		expect(status).toBe(200)
		expect(data.ok).toBe(true)
		expect(data.stateless).toBe(true)
	})

	it('rejects a roster that is too small', async () => {
		const players = await makePlayers(4)
		const res = await call('POST', 'deal', {
			players: players.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey })),
		})
		expect(res.status).toBe(400)
	})

	it('rejects a roster with a bad public key', async () => {
		const players = await makePlayers(5)
		const roster = players.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey }))
		roster[0].pubKey = { kty: 'oops' } as any
		const res = await call('POST', 'deal', { players: roster })
		expect(res.status).toBe(400)
	})

	// Exhaustively check every supported table size.
	for (let n = 5; n <= 10; n++) {
		it(`deals a correct, leak-free ${n}-player game`, async () => {
			const players = await makePlayers(n)
			const { cards } = await dealTo(players)
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
					if (hitlerKnows) expect(c.knows.fascists.length).toBe(expectFasc)
					else expect(c.knows).toBeNull() // Hitler is blind in 7–10 player games
				}
			}
		})
	}

	it('honors a host-chosen distribution (extra Fascists, Hitler blind)', async () => {
		const players = await makePlayers(6)
		const roster = players.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey }))
		const res = await call('POST', 'deal', {
			players: roster,
			setup: { fascists: 2, hitlerKnowsFascists: false },
		})
		expect(res.status).toBe(200)
		const cards: Record<string, any> = {}
		for (const p of players) cards[p.pid] = await decryptCard(res.data.cards[p.pid], p.privJwk)
		const roles = players.map((p) => cards[p.pid].role)
		expect(roles.filter((r) => r === 'fascist').length).toBe(2) // overrode official 1
		expect(roles.filter((r) => r === 'liberal').length).toBe(3) // 6 - 2 - 1
		expect(roles.filter((r) => r === 'hitler').length).toBe(1)
		const hitlerCard = Object.values(cards).find((c: any) => c.role === 'hitler') as any
		expect(hitlerCard.knows).toBeNull() // forced blind even in a 6-player game
	})

	it('rejects an out-of-range Fascist count', async () => {
		const players = await makePlayers(5)
		const roster = players.map((p) => ({ pid: p.pid, name: p.name, pubKey: p.pubKey }))
		// 5 players leaves room for at most 3 Fascists (need ≥1 Liberal); 4 is invalid
		const res = await call('POST', 'deal', { players: roster, setup: { fascists: 4 } })
		expect(res.status).toBe(400)
	})

	it('never lets one player (or the host) open another player’s card', async () => {
		const players = await makePlayers(7)
		const { raw } = await dealTo(players)
		const attacker = players[0]
		const victim = players[1]
		// The host relays raw ciphertext for everyone — but it's useless without
		// the victim's private key.
		await expect(decryptCard(raw[victim.pid], attacker.privJwk)).rejects.toThrow()
		// Sanity: the victim can open their own.
		const opened = await decryptCard(raw[victim.pid], victim.privJwk)
		expect(['liberal', 'fascist', 'hitler']).toContain(opened.role)
	})
})
