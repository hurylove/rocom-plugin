import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parseTraitCatalog, parseTraitDetail, searchTraits, findTrait, getTraitCatalog, getTraitDetail, cachedTraitImage } from '../models/trait-dex.js'

const [catalogHtml, galeHtml, partnerHtml, snapshotText] = await Promise.all([
  fs.readFile(new URL('./fixtures/trait-catalog.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./fixtures/trait-detail-gale.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./fixtures/trait-detail-partner.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../models/trait-dex-data.json', import.meta.url), 'utf8')
])
const snapshot = JSON.parse(snapshotText)
const traits = parseTraitCatalog(catalogHtml)
const gale = traits.find(trait => trait.name === '顺风')
const partner = traits.find(trait => trait.name === '最好的伙伴')
const NOW = Date.parse(snapshot.fetchedAt) + 1000
const WEEK = 7 * 86400000
const originalFetch = globalThis.fetch
let networkAttempts = 0
globalThis.fetch = async () => { networkAttempts++; throw new Error('Live networking is forbidden in trait-dex tests') }
after(() => { globalThis.fetch = originalFetch; assert.equal(networkAttempts, 0, 'tests must not attempt live networking') })
const reply = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
async function options(t, overrides = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rocom-trait-dex-'))
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }))
  return { cacheDir, now: () => NOW, timeoutMs: 1000, ...overrides }
}
const detailFile = (opts, trait) => path.join(opts.cacheDir, 'details', createHash('sha256').update(trait.url).digest('hex') + '.json')
const catalogFile = opts => path.join(opts.cacheDir, 'catalog.json')

function ownerCard({ url = '/nrc/冰宠', name = '冰宠', form = '', number = 'NO.001', type = '冰系' } = {}) {
  return '<div class="nrc-skill-pet-card nrc-feature-owner-card">' +
    '<div class="nrc-skill-pet-link"><a href="' + url + '" title="' + name + '">宠物</a></div>' +
    '<div class="nrc-skill-pet-top"><span class="nrc-skill-pet-number">' + number + '</span></div>' +
    '<div class="nrc-skill-pet-avatar"><img src="/images/avatar.png"></div>' +
    '<div class="nrc-skill-pet-name">' + name + '</div><div class="nrc-skill-pet-subtitle">' + form + '</div>' +
    '<div class="nrc-skill-pet-types"><span class="nrc-skill-type-chip" title="' + type + '"></span></div></div>'
}
const tinyDetail = (owners, total = '共 0 个精灵形态') => '<div class="nrc-skills nrc-skill-detail nrc-feature-detail" data-skill-id="skill_000045" data-skill-type="翼">' +
  '<div class="nrc-skill-layout nrc-feature-detail-layout"><div class="nrc-skill-summary nrc-feature-summary">' +
  '<div class="nrc-skill-identity"><div class="nrc-skill-icon"><img src="https://patchwiki.biligame.com/images/nrc/a.png"></div>' +
  '<div class="nrc-skill-identity-copy"><div class="nrc-skill-name">顺风</div></div></div>' +
  '<div class="nrc-skill-effect"><div class="nrc-skill-effect-label">特性效果</div>' +
  '<div class="nrc-skill-effect-text">前<span><a href="/nrc/冻结">冻<b>结</b></a></span>后&#33;&amp;</div></div></div>' +
  '<div class="nrc-skill-main"><div class="nrc-skill-learners nrc-feature-owners"><div class="nrc-skill-learners-head">' +
  '<div class="nrc-skill-section-title">拥有该特性的精灵</div><div class="nrc-skill-total">' + total + '</div></div>' +
  '<div class="nrc-skill-pet-grid nrc-feature-owner-grid">' + owners + '</div></div></div></div></div>'

test('catalog fixture yields all 243 complete traits and a matching sourced snapshot', () => {
  assert.equal(traits.length, 243)
  assert.equal(new Set(traits.map(trait => trait.id)).size, 243)
  assert.equal(new Set(traits.map(trait => trait.name)).size, 243)
  assert.deepEqual(snapshot.traits, traits)
  assert.match(snapshot.source, /^https:\/\/wiki\.biligame\.com\/nrc\//)
  assert.ok(Number.isFinite(Date.parse(snapshot.fetchedAt)))
  for (const trait of traits) {
    for (const field of ['id', 'name', 'type', 'secondaryType', 'description', 'icon', 'url']) assert.equal(typeof trait[field], 'string', field)
    assert.ok(trait.name && trait.description && trait.type)
    assert.match(trait.url, /^https:\/\/wiki\.biligame\.com\/nrc\//)
    assert.match(trait.icon, /^https:\/\/patchwiki\.biligame\.com\/images\/nrc\//)
  }
  assert.equal(partner.type, '光')
  assert.equal(partner.secondaryType, '光')
  assert.equal(partner.description, '造成克制伤害后，获得攻防速+20%，并回复2能量。')
  assert.equal(gale.type, '翼')
})

test('search matches name and effect text without mutating the catalog', () => {
  const ids = traits.map(trait => trait.id)
  assert.ok(searchTraits('克制', traits).length > 0)
  assert.ok(searchTraits('克制', traits).every(trait => trait.name.includes('克制') || trait.description.includes('克制')))
  assert.ok(searchTraits('星陨', traits).length > 0)
  assert.ok(searchTraits('顺风', traits).includes(gale))
  assert.equal(searchTraits('顺风', traits)[0].name, '顺风')
  assert.deepEqual(searchTraits('   ', traits), [])
  assert.deepEqual(searchTraits('不存在的特性0123456789', traits), [])
  assert.deepEqual(traits.map(trait => trait.id), ids)
})

test('findTrait prefers exact names, resolves only unique fuzzy matches, and exposes ambiguity', () => {
  const data = [{ name: '顺风', description: '' }, { name: '飓风', description: '顺风时触发' }, { name: '乘风连击', description: '' }]
  assert.deepEqual(findTrait(' 顺风 ', data), { trait: data[0], candidates: [] })
  assert.deepEqual(findTrait('飓', data), { trait: data[1], candidates: [] })
  assert.deepEqual(findTrait('风', data), { trait: null, candidates: data })
  assert.deepEqual(findTrait('顺风时触发', data), { trait: null, candidates: [] })
  assert.deepEqual(findTrait('不存在', data), { trait: null, candidates: [] })
  assert.deepEqual(findTrait('', data), { trait: null, candidates: [] })
  assert.equal(findTrait('顺风', traits).trait.id, gale.id)
  assert.equal(findTrait('之', traits).candidates.length, 5)
})

test('gale detail keeps all 12 owner forms with numbers, icons and types', () => {
  const detail = parseTraitDetail(galeHtml, gale, { now: NOW })
  assert.equal(detail.name, '顺风')
  assert.equal(detail.description, '若先于敌方攻击，本次技能威力+50%。')
  assert.equal(detail.total, 12)
  assert.equal(detail.owners.length, 12)
  assert.equal(new Set(detail.owners.map(owner => owner.url)).size, 12)
  const spring = detail.owners[0]
  assert.equal(spring.name, '雪绒鸟')
  assert.equal(spring.formLabel, '春天的样子')
  assert.equal(spring.displayName, '雪绒鸟（春天的样子）')
  assert.equal(spring.number, '018')
  assert.deepEqual(spring.types, ['翼'])
  assert.match(spring.icon, /^https:\/\/patchwiki\.biligame\.com\/images\/nrc\//)
  assert.ok(detail.owners.some(owner => owner.displayName === '雪绒鸟（本来的样子）'))
  assert.equal(detail.fetchedAt, new Date(NOW).toISOString())
  assert.equal(detail.stale, false)
})

test('partner detail keeps the single owner and the effect text', () => {
  const detail = parseTraitDetail(partnerHtml, partner)
  assert.equal(detail.total, 1)
  assert.equal(detail.owners.length, 1)
  assert.equal(detail.owners[0].name, '迪莫')
  assert.equal(detail.owners[0].number, '001')
  assert.equal(detail.owners[0].displayName, '迪莫')
  assert.deepEqual(detail.owners[0].types, ['光'])
  assert.equal(detail.description, '造成克制伤害后，获得攻防速+20%，并回复2能量。')
})

test('HTML tree handles nested text, entities, void tags and empty shells', () => {
  const detail = parseTraitDetail(tinyDetail(''), gale)
  assert.equal(detail.description, '前冻结后!&')
  assert.equal(detail.total, 0)
  assert.deepEqual(detail.owners, [])
  assert.deepEqual(parseTraitCatalog('<html><script>bad()</script><style>.bad{}</style></html>'), [])
  assert.throws(() => parseTraitDetail('<div class="nrc-skill-name">顺风</div>', gale), /Incomplete trait detail markup/)
  assert.throws(() => parseTraitDetail(partnerHtml, gale), /empty trait detail/)
})

test('owner URL plus form dedup keeps forms separate and drops exact repeats', () => {
  const html = tinyDetail(ownerCard() + ownerCard() + ownerCard({ url: '/nrc/冰宠（冬天）', form: '冬天' }), '共 2 个精灵形态')
  const detail = parseTraitDetail(html, gale)
  assert.equal(detail.owners.length, 2)
  assert.equal(detail.total, 2)
  assert.equal(detail.owners[1].displayName, '冰宠（冬天）')
  assert.equal(detail.owners[0].url, 'https://wiki.biligame.com/nrc/' + encodeURIComponent('冰宠'))
})

test('declared catalog and owner counts reject truncated, missing and miscounted records', () => {
  const cardOpening = '<div class="nrc-skill-catalog-card nrc-feature-catalog-card"'
  const truncatedCatalog = catalogHtml.slice(0, catalogHtml.indexOf(cardOpening, catalogHtml.indexOf(cardOpening) + cardOpening.length))
  assert.throws(() => parseTraitCatalog(truncatedCatalog), /Incomplete trait catalog/)
  assert.throws(() => parseTraitCatalog(catalogHtml.replace('data-skill-catalog-total="243"', 'data-skill-catalog-total="242"')), /Incomplete trait catalog count/)
  assert.throws(() => parseTraitCatalog(catalogHtml.replace('243 / 243', '242 / 243')), /Incomplete trait catalog count/)
  assert.throws(() => parseTraitCatalog(catalogHtml.replace('<div class="nrc-feature-card-description">造成克制伤害后，获得攻防速+20%，并回复2能量。</div>', '<div class="nrc-feature-card-description"></div>')), /Incomplete trait catalog card/)
  const truncatedOwners = galeHtml.slice(0, galeHtml.indexOf('<div class="nrc-skill-pet-card nrc-feature-owner-card"'))
  assert.throws(() => parseTraitDetail(truncatedOwners, gale), /Incomplete trait detail/)
  assert.throws(() => parseTraitDetail(galeHtml.replace('共 12 个精灵形态', '共 13 个精灵形态'), gale), /Incomplete trait owner counts/)
  assert.throws(() => parseTraitDetail(tinyDetail(ownerCard(), '共 2 个精灵形态'), gale), /Incomplete trait owner counts/)
  assert.throws(() => parseTraitDetail(tinyDetail(ownerCard(), ''), gale), /Incomplete trait owner counts/)
})

test('bundled catalog is available offline without fetching while fresh', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; throw new Error('offline') } })
  const result = await getTraitCatalog(opts)
  assert.equal(result.traits.length, 243)
  assert.equal(result.stale, false)
  assert.equal(calls, 0)
})

test('catalog refresh succeeds, persists atomically and uses fresh disk cache', async t => {
  let calls = 0
  const opts = await options(t, { refresh: true, fetcher: async () => { calls++; return reply(catalogHtml) } })
  const result = await getTraitCatalog(opts)
  assert.equal(result.traits.length, 243)
  assert.equal(result.stale, false)
  const cached = await getTraitCatalog({ ...opts, refresh: false })
  assert.equal(calls, 1)
  assert.deepEqual(result, cached)
  assert.equal(JSON.parse(await fs.readFile(catalogFile(opts), 'utf8')).traits.length, 243)
  assert.deepEqual((await fs.readdir(opts.cacheDir)).filter(file => file.endsWith('.tmp')), [])
})

test('catalog HTTP failure and miscounted pages retain the last good cache unchanged', async t => {
  const opts = await options(t, { refresh: true, fetcher: async () => reply(catalogHtml) })
  await getTraitCatalog(opts)
  const before = await fs.readFile(catalogFile(opts), 'utf8')
  const cardOpening = '<div class="nrc-skill-catalog-card nrc-feature-catalog-card"'
  const truncatedCatalog = catalogHtml.slice(0, catalogHtml.indexOf(cardOpening, catalogHtml.indexOf(cardOpening) + cardOpening.length))
  const failures = [async () => reply('unavailable', 503), async () => reply('<html>empty shell</html>'), async () => reply(truncatedCatalog), async () => reply(catalogHtml.replace('243 / 243', '242 / 243'))]
  for (const fetcher of failures) {
    const stale = await getTraitCatalog({ ...opts, now: NOW + WEEK, fetcher })
    assert.equal(stale.stale, true)
    assert.equal(stale.traits.length, 243)
    assert.equal(await fs.readFile(catalogFile(opts), 'utf8'), before)
  }
})

test('expired snapshot remains searchable after network timeout without a disk cache', async t => {
  let signal
  const opts = await options(t, { now: NOW + WEEK, timeoutMs: 15, fetcher: (url, init) => { signal = init.signal; return new Promise(() => {}) } })
  const result = await getTraitCatalog(opts)
  assert.equal(result.stale, true)
  assert.equal(findTrait('顺风', result.traits).trait.type, '翼')
  assert.equal(signal.aborted, true)
  await assert.rejects(fs.access(catalogFile(opts)))
})

test('detail caches successfully for exactly seven days, then refreshes', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(galeHtml) } })
  const initial = await getTraitDetail(gale, opts)
  assert.equal(calls, 1)
  const fresh = await getTraitDetail(gale, { ...opts, now: NOW + WEEK - 1 })
  assert.equal(fresh.stale, false)
  assert.equal(calls, 1)
  const renewed = await getTraitDetail(gale, { ...opts, now: NOW + WEEK })
  assert.equal(calls, 2)
  assert.equal(initial.fetchedAt, new Date(NOW).toISOString())
  assert.equal(renewed.fetchedAt, new Date(NOW + WEEK).toISOString())
  assert.equal(renewed.owners.length, 12)
})

test('detail HTTP failure, empty shell, wrong page and timeout never overwrite a good cache', async t => {
  const opts = await options(t, { fetcher: async () => reply(galeHtml) })
  await getTraitDetail(gale, opts)
  const before = await fs.readFile(detailFile(opts, gale), 'utf8')
  const truncatedOwners = galeHtml.slice(0, galeHtml.indexOf('<div class="nrc-skill-pet-card nrc-feature-owner-card"'))
  const failures = [async () => reply('unavailable', 502), async () => reply('<div class="nrc-feature-detail"></div>'), async () => reply(partnerHtml), async () => reply(truncatedOwners), async () => reply(galeHtml.replace('共 12 个精灵形态', '共 13 个精灵形态')), async () => new Promise(() => {})]
  for (const fetcher of failures) {
    const result = await getTraitDetail(gale, { ...opts, now: NOW + WEEK, timeoutMs: 15, fetcher })
    assert.equal(result.stale, true)
    assert.equal(result.fetchedAt, new Date(NOW).toISOString())
    assert.equal(result.description, '若先于敌方攻击，本次技能威力+50%。')
    assert.equal(result.owners.length, 12)
    assert.equal(await fs.readFile(detailFile(opts, gale), 'utf8'), before)
  }
})

test('uncached HTTP, empty detail, hanging fetch and hanging body reject without poisoning disk', async t => {
  const opts = await options(t, { timeoutMs: 15 })
  for (const fetcher of [async () => reply('bad', 500), async () => reply('<html></html>'), async () => new Promise(() => {}), async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
    await assert.rejects(getTraitDetail(gale, { ...opts, fetcher }), /HTTP|Incomplete trait|empty trait detail|timed out/)
    await assert.rejects(fs.access(detailFile(opts, gale)))
  }
})

test('simultaneous detail and catalog requests coalesce by resource and fetcher', async t => {
  const opts = await options(t)
  let detailCalls = 0
  const detailFetcher = async () => { detailCalls++; await new Promise(resolve => setTimeout(resolve, 30)); return reply(galeHtml) }
  const results = await Promise.all(Array.from({ length: 8 }, () => getTraitDetail(gale, { ...opts, fetcher: detailFetcher })))
  assert.equal(detailCalls, 1)
  assert.ok(results.every(result => result.name === '顺风' && !result.stale))
  results[0].owners.pop()
  assert.equal(results[1].owners.length, 12)
  let catalogCalls = 0
  const catalogFetcher = async () => { catalogCalls++; await new Promise(resolve => setTimeout(resolve, 30)); return reply(catalogHtml) }
  const catalogs = await Promise.all(Array.from({ length: 5 }, () => getTraitCatalog({ ...opts, refresh: true, fetcher: catalogFetcher })))
  assert.equal(catalogCalls, 1)
  assert.ok(catalogs.every(result => result.traits.length === 243))
})

test('failed merged requests are evicted, allowing a later successful retry', async t => {
  let fail = true
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(fail ? 'offline' : galeHtml, fail ? 503 : 200) } })
  await assert.rejects(getTraitDetail(gale, opts), /HTTP 503/)
  fail = false
  assert.equal((await getTraitDetail(gale, opts)).name, '顺风')
  assert.equal(calls, 2)
})

test('untrusted detail URLs and redirects are refused', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(galeHtml) } })
  for (const url of ['http://127.0.0.1/admin', 'https://wiki.biligame.com.evil/nrc/a', 'file:///etc/passwd', 'https://wiki.biligame.com/elsewhere']) await assert.rejects(getTraitDetail({ ...gale, url }, opts), /Invalid trait URL/)
  assert.equal(calls, 0)
  await assert.rejects(getTraitDetail(gale, { ...opts, fetcher: async () => ({ ok: true, redirected: true, url: 'http://127.0.0.1/', text: async () => galeHtml }) }), /Untrusted/)
})

const imageUrl = 'https://patchwiki.biligame.com/images/nrc/a/ab/trait.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')

test('trusted images land as file URLs, coalesce, and reuse local files', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async (url, init) => { calls++; assert.equal(init.redirect, 'error'); await new Promise(resolve => setTimeout(resolve, 30)); return new Response(png, { headers: { 'content-type': 'image/png' } }) } })
  const urls = await Promise.all(Array.from({ length: 6 }, () => cachedTraitImage(imageUrl, opts)))
  assert.equal(calls, 1)
  assert.ok(urls.every(url => url === urls[0] && url.startsWith('file:')))
  assert.deepEqual(await fs.readFile(fileURLToPath(urls[0])), png)
  assert.equal(await cachedTraitImage(imageUrl, opts), urls[0])
  assert.equal(calls, 1)
})

test('images reject arbitrary URLs, active formats, credentials, alternate ports and fake CDN suffixes', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return new Response(png) } })
  for (const url of ['', 'file:///secret.png', 'http://127.0.0.1/x.png', 'http://patchwiki.biligame.com/images/nrc/x.png', 'https://evil.test/x.png', 'https://patchwiki.biligame.com.evil/images/nrc/x.png', 'https://patchwiki.biligame.com/private.png', 'https://patchwiki.biligame.com/images/nrc/x.svg', 'https://user@patchwiki.biligame.com/images/nrc/x.png', 'https://patchwiki.biligame.com:8080/images/nrc/x.png']) assert.equal(await cachedTraitImage(url, opts), '')
  assert.equal(calls, 0)
})

test('image HTTP, redirect, invalid body, oversize and timeout failures return empty without cache writes', async t => {
  const opts = await options(t, { timeoutMs: 15 })
  const failures = [
    async () => reply('bad', 404),
    async () => new Response('<script>bad</script>', { headers: { 'content-type': 'image/png' } }),
    async () => new Response(png, { headers: { 'content-type': 'text/html' } }),
    async () => new Response(png, { headers: { 'content-type': 'image/png', 'content-length': String(6 * 1024 * 1024) } }),
    async () => ({ ok: true, redirected: true, url: 'https://evil.test/x.png', arrayBuffer: async () => png }),
    async () => new Promise(() => {}),
    async () => ({ ok: true, arrayBuffer: () => new Promise(() => {}) })
  ]
  for (const fetcher of failures) assert.equal(await cachedTraitImage(imageUrl, { ...opts, fetcher }), '')
  assert.deepEqual(await fs.readdir(opts.cacheDir), [])
})

test('fresh bundled catalog results cannot mutate the shared snapshot', async t => {
  const opts = await options(t, { fetcher: async () => { throw new Error('offline') } })
  const first = await getTraitCatalog(opts)
  first.traits[0].name = 'changed'
  first.traits[0].description = 'changed'
  const second = await getTraitCatalog(opts)
  assert.equal(second.traits[0].name, '最好的伙伴')
  assert.equal(second.traits[0].description, '造成克制伤害后，获得攻防速+20%，并回复2能量。')
})
