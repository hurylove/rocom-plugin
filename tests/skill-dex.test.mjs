import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { parseSkillCatalog, parseSkillDetail, searchSkills, findSkill, getSkillCatalog, getSkillDetail, cachedSkillImage } from '../models/skill-dex.js'

const [catalogHtml, sneezeHtml, scratchHtml, snapshotText] = await Promise.all([
  fs.readFile(new URL('./fixtures/skill-catalog.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./fixtures/skill-sneeze.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('./fixtures/skill-scratch.html', import.meta.url), 'utf8'),
  fs.readFile(new URL('../models/skill-dex-data.json', import.meta.url), 'utf8')
])
const snapshot = JSON.parse(snapshotText)
const skills = parseSkillCatalog(catalogHtml)
const sneeze = skills.find(skill => skill.name === '打喷嚏')
const scratch = skills.find(skill => skill.name === '抓挠')
const NOW = Date.parse(snapshot.fetchedAt) + 1000
const WEEK = 7 * 86400000
const originalFetch = globalThis.fetch
let networkAttempts = 0
globalThis.fetch = async () => { networkAttempts++; throw new Error('Live networking is forbidden in skill-dex tests') }
after(() => { globalThis.fetch = originalFetch; assert.equal(networkAttempts, 0, 'tests must not attempt live networking') })
const reply = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
async function options(t, overrides = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rocom-skill-dex-'))
  t.after(() => fs.rm(cacheDir, { recursive: true, force: true }))
  return { cacheDir, now: () => NOW, timeoutMs: 1000, ...overrides }
}
const detailFile = opts => path.join(opts.cacheDir, 'details', createHash('sha256').update(sneeze.url).digest('hex') + '.json')
const catalogFile = opts => path.join(opts.cacheDir, 'catalog.json')

function learnerCard({ source = 'stone', url = '/nrc/冰宠', name = '冰宠', form = '', level = '技能石' } = {}) {
  return '<div class="nrc-skill-pet-card" data-skill-source="' + source + '">' +
    '<div class="nrc-skill-pet-link"><a href="' + url + '">宠物</a></div>' +
    '<span class="nrc-skill-pet-number">NO.001</span><span class="nrc-skill-pet-level">' + level + '</span>' +
    '<div class="nrc-skill-pet-avatar"><img src="/images/avatar.png"></div>' +
    '<div class="nrc-skill-pet-name">' + name + '</div><div class="nrc-skill-pet-subtitle">' + form + '</div>' +
    '<div class="nrc-skill-pet-types"><span class="nrc-skill-type-chip"><img alt="冰系"></span></div></div>'
}
const tinyDetail = learners => '<div class="nrc-skill-detail"><div class="nrc-skill-summary">' +
  '<div class="nrc-skill-name">打喷嚏</div><span class="nrc-skill-type-chip">冰系</span><span class="nrc-skill-category-chip">状态</span>' +
  '<div class="nrc-skill-effect-text">前<span><a href="/nrc/冻结">冻<b>结</b></a></span>后&#33;&amp;</div>' +
  '<div class="nrc-skill-stat"><span class="nrc-skill-stat-value">—</span><span class="nrc-skill-stat-label">威力</span></div>' +
  '<div class="nrc-skill-stat"><span class="nrc-skill-stat-value">0</span><span class="nrc-skill-stat-label">耗能</span></div></div>' +
  (learners === null ? '' : '<div class="nrc-skill-learners">' + learners + '</div>') + '</div>'

test('catalog fixture yields all 579 complete skills and a matching sourced snapshot', () => {
  assert.equal(skills.length, 579)
  assert.equal(new Set(skills.map(skill => skill.id)).size, 579)
  assert.deepEqual(snapshot.skills, skills)
  assert.match(snapshot.source, /^https:\/\/wiki\.biligame\.com\/nrc\//)
  assert.ok(Number.isFinite(Date.parse(snapshot.fetchedAt)))
  for (const skill of skills) {
    for (const field of ['id', 'name', 'type', 'category', 'power', 'energy', 'description', 'season', 'url', 'icon']) assert.equal(typeof skill[field], 'string', field)
    assert.ok(skill.name && skill.description && skill.power && skill.energy)
    assert.ok(Array.isArray(skill.tags))
    assert.match(skill.url, /^https:\/\/wiki\.biligame\.com\/nrc\//)
    assert.match(skill.icon, /^https:\/\/patchwiki\.biligame\.com\/images\/nrc\//)
  }
  assert.equal(scratch.power, '35')
  assert.equal(scratch.energy, '0')
})

test('search matches name, complete description and tags without mutating the catalog', () => {
  const ids = skills.map(skill => skill.id)
  assert.ok(searchSkills('打喷嚏', skills).includes(sneeze))
  assert.ok(searchSkills('1层冻结', skills).includes(sneeze))
  assert.ok(searchSkills('回能', skills).includes(scratch))
  assert.deepEqual(searchSkills('   ', skills), [])
  assert.deepEqual(searchSkills('不存在的技能0123456789', skills), [])
  assert.deepEqual(skills.map(skill => skill.id), ids)
  assert.equal(searchSkills('抓挠')[0].name, '抓挠')
})

test('findSkill prefers exact names, resolves only unique fuzzy matches, and exposes ambiguity', () => {
  const data = [{ name: '冰击', description: '', tags: [] }, { name: '强力冰击', description: '引用冰击', tags: ['冻结'] }, { name: '火球', description: '冻结相关', tags: [] }]
  assert.deepEqual(findSkill(' 冰击 ', data), { skill: data[0], candidates: [] })
  assert.deepEqual(findSkill('强力', data), { skill: data[1], candidates: [] })
  assert.deepEqual(findSkill('冰', data), { skill: null, candidates: data.slice(0, 2) })
  assert.deepEqual(findSkill('冻结', data), { skill: null, candidates: [] })
  assert.deepEqual(findSkill('引用', data), { skill: null, candidates: [] })
  assert.deepEqual(findSkill('回能', [scratch]), { skill: null, candidates: [] })
  assert.deepEqual(searchSkills('冻结', data), data.slice(1))
  assert.deepEqual(findSkill('不存在', data), { skill: null, candidates: [] })
  assert.deepEqual(findSkill('', data), { skill: null, candidates: [] })
  assert.equal(findSkill('打喷嚏', skills).skill.id, sneeze.id)
})

test('sneeze keeps full nested effect, mechanics, stone condition and all 18 learners', () => {
  const detail = parseSkillDetail(sneezeHtml, sneeze, { now: NOW })
  assert.deepEqual([detail.type, detail.category, detail.power, detail.energy], ['冰', '状态', '—', '1'])
  assert.equal(detail.description, '3连击，每次连击敌方获得1层冻结。')
  assert.deepEqual(detail.relatedMechanics, [{ name: '冻结', url: 'https://wiki.biligame.com/nrc/' + encodeURIComponent('冻结') }])
  assert.equal(detail.stoneSources.length, 1)
  assert.equal(detail.stoneSources[0].name, '睡铃雪影娃娃')
  assert.equal(detail.stoneSources[0].condition, '使用2次打喷嚏')
  assert.equal(detail.learningAvailable, true)
  assert.deepEqual(Object.values(detail.learners).map(list => list.length), [1, 0, 17])
  const learners = Object.values(detail.learners).flat()
  assert.equal(new Set(learners.map(pet => pet.name)).size, 8)
  assert.equal(detail.learners.default[0].level, '26')
  assert.equal(detail.learners.default[0].number, '440')
  assert.deepEqual(detail.learners.default[0].types, ['冰', '草'])
  assert.ok(detail.learners.stone.every(pet => pet.level === '' && pet.source === 'stone'))
  assert.equal(learners.filter(pet => pet.name === '香草甜甜').length, 3)
  assert.equal(learners.filter(pet => pet.name === '圣代甜甜').length, 9)
  assert.ok(learners.some(pet => pet.displayName === '香草甜甜（杨桃饰品）'))
  assert.equal(new Set(learners.map(pet => pet.url + ':' + pet.source)).size, 18)
  assert.equal(detail.fetchedAt, new Date(NOW).toISOString())
  assert.equal(detail.stale, false)
})

test('scratch detail preserves 35 power and zero energy as strings', () => {
  const detail = parseSkillDetail(scratchHtml, scratch)
  assert.equal(detail.power, '35')
  assert.equal(detail.energy, '0')
  assert.equal(detail.description, '造成物伤，自己回复1能量。')
})

test('HTML tree handles nested text, entities, void tags, missing learning section and empty shells', () => {
  const detail = parseSkillDetail(tinyDetail(null), sneeze)
  assert.equal(detail.description, '前冻结后!&')
  assert.deepEqual(detail.relatedMechanics.map(item => item.name), ['冻结'])
  assert.equal(detail.learningAvailable, false)
  assert.deepEqual(detail.learners, { default: [], blood: [], stone: [] })
  assert.deepEqual(parseSkillCatalog('<html><script>bad()</script><style>.bad{}</style></html>'), [])
  assert.throws(() => parseSkillDetail('<div class="nrc-skill-name">打喷嚏</div>', sneeze), /empty skill detail/)
  assert.throws(() => parseSkillDetail(scratchHtml, sneeze), /empty skill detail/)
})

test('learner URL plus source dedup keeps forms and learning methods separate', () => {
  const same = learnerCard()
  const html = tinyDetail(same + same + learnerCard({ source: 'blood', level: '血脉' }) + learnerCard({ source: 'default', level: 'Lv.0' }) + learnerCard({ url: '/nrc/冰宠（冬天）', form: '冬天' }))
  const detail = parseSkillDetail(html, sneeze)
  assert.deepEqual(Object.values(detail.learners).map(list => list.length), [1, 1, 2])
  assert.equal(detail.learners.blood[0].level, '')
  assert.equal(detail.learners.default[0].level, '0')
  assert.equal(detail.learners.stone[1].displayName, '冰宠（冬天）')
  assert.equal(detail.learners.stone[0].url, 'https://wiki.biligame.com/nrc/' + encodeURIComponent('冰宠'))
})

test('bundled catalog is available offline without fetching while fresh', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; throw new Error('offline') } })
  const result = await getSkillCatalog(opts)
  assert.equal(result.skills.length, 579)
  assert.equal(result.stale, false)
  assert.equal(calls, 0)
})

test('catalog refresh succeeds, persists atomically and uses fresh disk cache', async t => {
  let calls = 0
  const opts = await options(t, { refresh: true, fetcher: async () => { calls++; return reply(catalogHtml) } })
  const result = await getSkillCatalog(opts)
  assert.equal(result.skills.length, 579)
  assert.equal(result.stale, false)
  const cached = await getSkillCatalog({ ...opts, refresh: false })
  assert.equal(calls, 1)
  assert.deepEqual(result, cached)
  assert.equal(JSON.parse(await fs.readFile(catalogFile(opts), 'utf8')).skills.length, 579)
  assert.deepEqual((await fs.readdir(opts.cacheDir)).filter(file => file.endsWith('.tmp')), [])
})

test('catalog HTTP failure and empty pages retain the last good cache unchanged', async t => {
  const opts = await options(t, { refresh: true, fetcher: async () => reply(catalogHtml) })
  await getSkillCatalog(opts)
  const before = await fs.readFile(catalogFile(opts), 'utf8')
  for (const fetcher of [async () => reply('unavailable', 503), async () => reply('<html>empty shell</html>'), async () => reply(truncatedCatalog), async () => reply(catalogHtml.replace('579 / 579', '578 / 579'))]) {
    const stale = await getSkillCatalog({ ...opts, now: NOW + WEEK, fetcher })
    assert.equal(stale.stale, true)
    assert.equal(stale.skills.length, 579)
    assert.equal(await fs.readFile(catalogFile(opts), 'utf8'), before)
  }
})

test('expired snapshot remains searchable after network timeout without a disk cache', async t => {
  let signal
  const opts = await options(t, { now: NOW + WEEK, timeoutMs: 15, fetcher: (url, init) => { signal = init.signal; return new Promise(() => {}) } })
  const result = await getSkillCatalog(opts)
  assert.equal(result.stale, true)
  assert.equal(findSkill('抓挠', result.skills).skill.energy, '0')
  assert.equal(signal.aborted, true)
  await assert.rejects(fs.access(catalogFile(opts)))
})

test('detail caches successfully for exactly seven days, then refreshes', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(sneezeHtml) } })
  const initial = await getSkillDetail(sneeze, opts)
  assert.equal(calls, 1)
  const fresh = await getSkillDetail(sneeze, { ...opts, now: NOW + WEEK - 1 })
  assert.equal(fresh.stale, false)
  assert.equal(calls, 1)
  const renewed = await getSkillDetail(sneeze, { ...opts, now: NOW + WEEK })
  assert.equal(calls, 2)
  assert.equal(initial.fetchedAt, new Date(NOW).toISOString())
  assert.equal(renewed.fetchedAt, new Date(NOW + WEEK).toISOString())
})

test('detail HTTP failure, empty shell, wrong page and timeout never overwrite a good cache', async t => {
  const opts = await options(t, { fetcher: async () => reply(sneezeHtml) })
  await getSkillDetail(sneeze, opts)
  const before = await fs.readFile(detailFile(opts), 'utf8')
  const failures = [async () => reply('unavailable', 502), async () => reply('<div class="nrc-skill-detail"></div>'), async () => reply(scratchHtml), async () => reply(truncatedLearners), async () => reply(sneezeHtml.replace('data-skill-source="stone"', 'data-skill-source="blood"')), async () => new Promise(() => {})]
  for (const fetcher of failures) {
    const result = await getSkillDetail(sneeze, { ...opts, now: NOW + WEEK, timeoutMs: 15, fetcher })
    assert.equal(result.stale, true)
    assert.equal(result.fetchedAt, new Date(NOW).toISOString())
    assert.equal(result.description, '3连击，每次连击敌方获得1层冻结。')
    assert.equal(await fs.readFile(detailFile(opts), 'utf8'), before)
  }
})

test('uncached HTTP, empty detail, hanging fetch and hanging body reject without poisoning disk', async t => {
  const opts = await options(t, { timeoutMs: 15 })
  for (const fetcher of [async () => reply('bad', 500), async () => reply('<html></html>'), async () => new Promise(() => {}), async () => ({ ok: true, text: () => new Promise(() => {}) })]) {
    await assert.rejects(getSkillDetail(sneeze, { ...opts, fetcher }), /HTTP|empty skill detail|timed out/)
    await assert.rejects(fs.access(detailFile(opts)))
  }
})

test('simultaneous detail and catalog requests coalesce by resource and fetcher', async t => {
  const opts = await options(t)
  let detailCalls = 0
  const detailFetcher = async () => { detailCalls++; await new Promise(resolve => setTimeout(resolve, 30)); return reply(sneezeHtml) }
  const results = await Promise.all(Array.from({ length: 8 }, () => getSkillDetail(sneeze, { ...opts, fetcher: detailFetcher })))
  assert.equal(detailCalls, 1)
  assert.ok(results.every(result => result.name === '打喷嚏' && !result.stale))
  results[0].learners.stone.pop()
  assert.equal(results[1].learners.stone.length, 17)
  let catalogCalls = 0
  const catalogFetcher = async () => { catalogCalls++; await new Promise(resolve => setTimeout(resolve, 30)); return reply(catalogHtml) }
  const catalogs = await Promise.all(Array.from({ length: 5 }, () => getSkillCatalog({ ...opts, refresh: true, fetcher: catalogFetcher })))
  assert.equal(catalogCalls, 1)
  assert.ok(catalogs.every(result => result.skills.length === 579))
})

test('failed merged requests are evicted, allowing a later successful retry', async t => {
  let fail = true
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(fail ? 'offline' : sneezeHtml, fail ? 503 : 200) } })
  await assert.rejects(getSkillDetail(sneeze, opts), /HTTP 503/)
  fail = false
  assert.equal((await getSkillDetail(sneeze, opts)).name, '打喷嚏')
  assert.equal(calls, 2)
})

test('untrusted detail URLs and redirects are refused', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return reply(sneezeHtml) } })
  for (const url of ['http://127.0.0.1/admin', 'https://wiki.biligame.com.evil/nrc/a', 'file:///etc/passwd', 'https://wiki.biligame.com/elsewhere']) await assert.rejects(getSkillDetail({ ...sneeze, url }, opts), /Invalid skill URL/)
  assert.equal(calls, 0)
  await assert.rejects(getSkillDetail(sneeze, { ...opts, fetcher: async () => ({ ok: true, redirected: true, url: 'http://127.0.0.1/', text: async () => sneezeHtml }) }), /Untrusted/)
})

const imageUrl = 'https://patchwiki.biligame.com/images/nrc/a/ab/skill.png'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=', 'base64')

test('trusted images land as file URLs, coalesce, and reuse local files', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async (url, init) => { calls++; assert.equal(init.redirect, 'error'); await new Promise(resolve => setTimeout(resolve, 30)); return new Response(png, { headers: { 'content-type': 'image/png' } }) } })
  const urls = await Promise.all(Array.from({ length: 6 }, () => cachedSkillImage(imageUrl, opts)))
  assert.equal(calls, 1)
  assert.ok(urls.every(url => url === urls[0] && url.startsWith('file:')))
  assert.deepEqual(await fs.readFile(fileURLToPath(urls[0])), png)
  assert.equal(await cachedSkillImage(imageUrl, opts), urls[0])
  assert.equal(calls, 1)
})

test('images reject arbitrary URLs, active formats, credentials, alternate ports and fake CDN suffixes', async t => {
  let calls = 0
  const opts = await options(t, { fetcher: async () => { calls++; return new Response(png) } })
  for (const url of ['', 'file:///secret.png', 'http://127.0.0.1/x.png', 'http://patchwiki.biligame.com/images/nrc/x.png', 'https://evil.test/x.png', 'https://patchwiki.biligame.com.evil/images/nrc/x.png', 'https://patchwiki.biligame.com/private.png', 'https://patchwiki.biligame.com/images/nrc/x.svg', 'https://user@patchwiki.biligame.com/images/nrc/x.png', 'https://patchwiki.biligame.com:8080/images/nrc/x.png']) assert.equal(await cachedSkillImage(url, opts), '')
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
  for (const fetcher of failures) assert.equal(await cachedSkillImage(imageUrl, { ...opts, fetcher }), '')
  assert.deepEqual(await fs.readdir(opts.cacheDir), [])
})
const cardOpening = '<div class="nrc-skill-catalog-card"'
const truncatedCatalog = catalogHtml.slice(0, catalogHtml.indexOf(cardOpening, catalogHtml.indexOf(cardOpening) + cardOpening.length))
const truncatedLearners = sneezeHtml.slice(0, sneezeHtml.indexOf('<div class="nrc-skill-pet-card"'))

test('declared catalog and learner counts reject truncated, missing and misgrouped records', () => {
  assert.throws(() => parseSkillCatalog(truncatedCatalog), /Incomplete skill catalog/)
  assert.throws(() => parseSkillCatalog(catalogHtml.replace('579 / 579', '578 / 579')), /Incomplete skill catalog count/)
  assert.throws(() => parseSkillDetail(truncatedLearners, sneeze), /Incomplete skill detail/)
  assert.throws(() => parseSkillDetail(sneezeHtml.replace('共 18 只', '共 19 只'), sneeze), /Incomplete skill learner counts/)
  assert.throws(() => parseSkillDetail(sneezeHtml.replace('data-skill-source="stone"', 'data-skill-source="blood"'), sneeze), /Incomplete skill learner counts/)
  assert.throws(() => parseSkillDetail(sneezeHtml.replace('data-skill-filter="stone"', 'data-skill-filter="unknown"'), sneeze), /Incomplete skill learner counts/)
})

test('an explicit genuine zero learner count is available, but absent learning data is not', () => {
  const zeroHeader = '<div class="nrc-skill-total">共 0 只</div>' + ['default', 'blood', 'stone'].map(source =>
    '<div class="nrc-skill-source-filter" data-skill-filter="' + source + '"><span class="nrc-skill-filter-count">0</span></div>').join('')
  const empty = parseSkillDetail(tinyDetail(zeroHeader), sneeze)
  assert.equal(empty.learningAvailable, true)
  assert.deepEqual(Object.values(empty.learners).map(list => list.length), [0, 0, 0])
  assert.equal(parseSkillDetail(tinyDetail(null), sneeze).learningAvailable, false)
  assert.throws(() => parseSkillDetail(tinyDetail('<div class="nrc-skill-total">共 1 只</div>'), sneeze), /Incomplete skill learner counts/)
})

test('fresh bundled catalog results cannot mutate the shared snapshot', async t => {
  const opts = await options(t, { fetcher: async () => { throw new Error('offline') } })
  const first = await getSkillCatalog(opts)
  first.skills[0].name = 'changed'
  first.skills[0].tags.push('changed')
  const second = await getSkillCatalog(opts)
  assert.equal(second.skills[0].name, '抓挠')
  assert.ok(!second.skills[0].tags.includes('changed'))
})
