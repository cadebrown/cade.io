// roo26-sw.js — tiny offline helper for cade.io/roo26.
// Cell service on the Farm is rough: network-first for pages (so updates land
// when there IS signal), cache-fallback when there isn't. CDN libs and built
// assets are cached as they're fetched.
const CACHE = 'roo26-v1'
const PRECACHE = ['/roo26', '/roo26/map', '/roo26/plan', '/roo26/info']

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll(PRECACHE))
			.then(() => self.skipWaiting()),
	)
})

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('roo26')).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	)
})

self.addEventListener('fetch', (e) => {
	const url = new URL(e.request.url)
	if (e.request.method !== 'GET') return

	// app pages: network-first, fall back to cache when offline
	const isPage = url.origin === location.origin && url.pathname.replace(/\/$/, '').startsWith('/roo26')
	// hashed build assets + leaflet CDN: cache-first (they're immutable-ish)
	const isAsset =
		(url.origin === location.origin && url.pathname.startsWith('/_astro/')) ||
		url.hostname === 'unpkg.com'

	if (isPage) {
		e.respondWith(
			fetch(e.request)
				.then((res) => {
					const copy = res.clone()
					caches.open(CACHE).then((c) => c.put(e.request, copy))
					return res
				})
				.catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || caches.match('/roo26'))),
		)
	} else if (isAsset) {
		e.respondWith(
			caches.match(e.request).then(
				(m) =>
					m ||
					fetch(e.request).then((res) => {
						const copy = res.clone()
						caches.open(CACHE).then((c) => c.put(e.request, copy))
						return res
					}),
			),
		)
	}
	// map tiles & weather API: let the network handle it (too big / too live to cache)
})
