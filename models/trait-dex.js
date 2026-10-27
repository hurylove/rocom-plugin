import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'

const WIKI_BASE = 'https://wiki.biligame.com'
const CATALOG_URL = WIKI_BASE + '/nrc/' + encodeURIComponent('特性图鉴')
const TTL = 7 * 86400000
const DEFAULT_CACHE = fileURLToPath(new URL('../data/trait_dex/', import.meta.url))
const SNAPSHOT = new URL('./trait-dex-data.json', import.meta.url)
const inflight = new Map()
const fetcherIds = new WeakMap()
let nextFetcherId = 0
let bundled

function decode(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', middot: '·' }
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? whole
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '\uFFFD'
  })
}
const clean = value => decode(value).replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFKC').toLowerCase()
const unique = (items, key) => [...new Map(items.map(item => [key(item), item])).values()]

function tree(html) {
  const root = { tag: '', attrs: {}, children: [] }
  const stack = [root]
  const source = String(html ?? '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])
  const tokens = /<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|<![^>]*>|[^<]+|</g
  for (const match of source.matchAll(tokens)) {
    const token = match[0]
    if (token.startsWith('<!')) continue
    const closing = token.match(/^<\/\s*([\w:-]+)/)
    if (closing) {
      const index = stack.findLastIndex(node => node.tag === closing[1].toLowerCase())
      if (index > 0) { stack[index].closed = true; stack.length = index }
      continue
    }
    const opening = token.match(/^<([\w:-]+)/)
    if (!opening) { stack.at(-1).children.push(token); continue }
    const tag = opening[1].toLowerCase()
    const attrs = {}
    const body = token.slice(opening[0].length, token.endsWith('/>') ? -2 : -1)
    for (const attr of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '')
    }
    const node = { tag, attrs, children: [], closed: voids.has(tag) || token.endsWith('/>') }
    stack.at(-1).children.push(node)
    if (tag === 'br') node.children.push(' ')
    if (!voids.has(tag) && !token.endsWith('/>')) stack.push(node)
  }
  return root
}
function select(root, predicate) {
  const result = []
  function walk(node) {
    if (!node || typeof node === 'string') return
    if (predicate(node)) result.push(node)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return result
}
const hasClass = (node, name) => (node.attrs.class || '').split(/\s+/).includes(name)
const all = (node, name) => select(node, child => hasClass(child, name))
const first = (node, name) => all(node, name)[0]
const byTag = (node, tag) => select(node, child => child.tag === tag)
function text(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  return node.children.map(text).join('')
}
const label = node => clean(text(node))
function absolute(value, base = WIKI_BASE) {
  try {
    if (!value) return ''
    const url = new URL(decode(value), base)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return ''
    url.hash = ''
    return url.href
  } catch { return '' }
}
const link = (node, base) => absolute(byTag(node, 'a')[0]?.attrs.href, base)
const icon = (node, base) => {
  const img = byTag(node, 'img')[0]
  return absolute(img?.attrs['data-src'] || img?.attrs.src, base)
}
const typeText = node => (label(node) || clean(byTag(node, 'img')[0]?.attrs.alt) || clean(node?.attrs?.title)).replace(/系$/, '')
function pageUrl(root, fallback) {
  const meta = byTag(root, 'meta').find(node => node.attrs.property === 'og:url')
  const canonical = byTag(root, 'link').find(node => node.attrs.rel === 'canonical')
  return absolute(canonical?.attrs.href || meta?.attrs.content || fallback, WIKI_BASE)
}
function traitFields(trait = {}) {
  const fields = ['id', 'name', 'type', 'secondaryType', 'description', 'icon', 'url']
  return Object.fromEntries(fields.map(key => [key, String(trait[key] ?? '')]))
}
function person(name, formLabel = '') {
  name = clean(name)
  formLabel = clean(formLabel)
  const match = name.match(/^(.*?)（([^（）]+)）$/)
  if (match && !formLabel) { name = match[1]; formLabel = match[2] }
  return { name, formLabel, displayName: formLabel ? name + '（' + formLabel + '）' : name }
}
const splitTypes = value => [...new Set(String(value ?? '').split('|').map(clean).filter(Boolean))]

export function parseTraitCatalog(html, options = {}) {
  const root = tree(html)
  const base = options.baseUrl || pageUrl(root, CATALOG_URL)
  const cards = all(root, 'nrc-feature-catalog-card')
  const section = first(root, 'nrc-feature-catalog')
  if ((section && !section.closed) || cards.some(card => !card.closed)) throw new Error('Incomplete trait catalog markup')
  const traits = cards.map(card => {
    const types = splitTypes(card.attrs['data-skill-catalog-type'])
    return {
      id: card.attrs['data-skill-catalog-id'] || '',
      name: label(first(card, 'nrc-skill-catalog-card-name')) || clean(byTag(first(card, 'nrc-skill-catalog-card-link'), 'a')[0]?.attrs.title),
      type: clean(card.attrs['data-feature-primary-type']).replace(/系$/, '') || types[0] || '',
      secondaryType: clean(card.attrs['data-feature-secondary-type']).replace(/系$/, '') || types[1] || types[0] || '',
      description: label(first(card, 'nrc-feature-card-description')),
      icon: icon(first(card, 'nrc-feature-card-decoration'), base),
      url: link(first(card, 'nrc-skill-catalog-card-link'), base)
    }
  })
  const result = unique(traits, trait => trait.url || trait.id || trait.name)
  if (section) {
    const declared = Number(section.attrs['data-skill-catalog-total'])
    if (!Number.isInteger(declared) || declared !== result.length) throw new Error('Incomplete trait catalog count')
    const counts = label(first(root, 'nrc-skill-catalog-result-count')).match(/(\d+)\s*\/\s*(\d+)/)
    if (counts && (Number(counts[1]) !== result.length || Number(counts[2]) !== result.length)) throw new Error('Incomplete trait catalog count')
  }
  if (result.some(trait => !validTrait(trait))) throw new Error('Incomplete trait catalog card')
  return result
}

export function parseTraitDetail(html, trait = {}, options = {}) {
  const root = tree(html)
  const base = options.baseUrl || pageUrl(root, trait.url || CATALOG_URL)
  const detailSection = first(root, 'nrc-feature-detail')
  const ownersSection = first(root, 'nrc-feature-owners')
  const summary = first(root, 'nrc-feature-summary') || detailSection || root
  if (!detailSection || !ownersSection) throw new Error('Incomplete trait detail markup')
  if ([detailSection, ownersSection, summary === root ? null : summary].some(node => node && !node.closed)) throw new Error('Incomplete trait detail markup')
  const effect = first(summary, 'nrc-skill-effect-text') || first(root, 'nrc-feature-card-description')
  const catalogTypes = [clean(trait.type), clean(trait.secondaryType)].filter(Boolean)
  const parsed = {
    ...traitFields(trait),
    id: clean(detailSection?.attrs['data-skill-id']) || String(trait.id ?? ''),
    name: label(first(summary, 'nrc-skill-name')) || label(first(root, 'nrc-skill-header-name')),
    type: catalogTypes[0] || clean(detailSection?.attrs['data-skill-type']).replace(/系$/, ''),
    secondaryType: catalogTypes[1] || clean(detailSection?.attrs['data-skill-type']).replace(/系$/, ''),
    description: label(effect),
    icon: icon(first(summary, 'nrc-skill-icon'), base) || String(trait.icon ?? ''),
    url: absolute(trait.url || base, base),
    owners: [],
    total: 0,
    fetchedAt: new Date(clock(options)).toISOString(),
    stale: false
  }
  for (const card of all(root, 'nrc-feature-owner-card')) {
    const pet = first(card, 'nrc-skill-pet-link')
    const entry = {
      ...person(label(first(card, 'nrc-skill-pet-name')) || clean(byTag(pet, 'a')[0]?.attrs.title), label(first(card, 'nrc-skill-pet-subtitle'))),
      number: label(first(card, 'nrc-skill-pet-number')).replace(/^NO\.?\s*/i, ''),
      url: link(pet, base),
      icon: icon(first(card, 'nrc-skill-pet-avatar'), base),
      types: [...new Set(all(first(card, 'nrc-skill-pet-types'), 'nrc-skill-type-chip').map(typeText).filter(Boolean))]
    }
    if (!card.closed || !entry.name || !entry.url) throw new Error('Incomplete trait owner')
    parsed.owners.push(entry)
  }
  parsed.owners = unique(parsed.owners, item => item.url + '\0' + item.displayName)
  const totalMatch = label(first(root, 'nrc-skill-total')).match(/(?:^|\D)(\d+)(?:\D|$)/)
  if (!totalMatch || Number(totalMatch[1]) !== parsed.owners.length) throw new Error('Incomplete trait owner counts')
  parsed.total = parsed.owners.length
  if (!validTrait(parsed) || (trait.name && norm(parsed.name) !== norm(trait.name))) throw new Error('Invalid or empty trait detail')
  return parsed
}

function snapshot() {
  if (!bundled) bundled = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  return bundled
}
export function searchTraits(keyword, traits = snapshot().traits) {
  const query = norm(keyword)
  if (!query) return []
  return traits.filter(trait => [trait.name, trait.description].some(value => norm(value).includes(query)))
    .sort((a, b) => Number(norm(b.name) === query) - Number(norm(a.name) === query))
}
export function findTrait(keyword, traits = snapshot().traits) {
  const query = norm(keyword)
  if (!query) return { trait: null, candidates: [] }
  const exact = traits.filter(trait => norm(trait.name) === query)
  const candidates = exact.length ? exact : traits.filter(trait => norm(trait.name).includes(query))
  return candidates.length === 1 ? { trait: candidates[0], candidates: [] } : { trait: null, candidates }
}
function clock(options) {
  const now = typeof options.now === 'function' ? options.now() : options.now ?? Date.now()
  const value = now instanceof Date ? now.getTime() : typeof now === 'string' ? Date.parse(now) : Number(now)
  if (!Number.isFinite(value)) throw new Error('Invalid now option')
  return value
}
const cacheRoot = options => path.resolve(options.cacheDir || DEFAULT_CACHE)
const digest = value => createHash('sha256').update(value).digest('hex')
const validTrait = trait => !!trait && ['id', 'name', 'type', 'secondaryType', 'description', 'icon', 'url'].every(key => typeof trait[key] === 'string') && ['name', 'description', 'url'].every(key => trait[key].trim())
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const validCatalog = data => !!data && validTime(data.fetchedAt) && Array.isArray(data.traits) && data.traits.length > 0 && data.traits.every(validTrait)
function validDetail(data, trait) {
  return validTrait(data) && validTime(data.fetchedAt) && data.url === trait.url && (!trait.name || norm(data.name) === norm(trait.name)) &&
    Number.isInteger(data.total) && Array.isArray(data.owners) && data.total === data.owners.length &&
    data.owners.every(item => item && typeof item.name === 'string' && typeof item.displayName === 'string' && typeof item.formLabel === 'string' &&
      typeof item.number === 'string' && typeof item.icon === 'string' && typeof item.url === 'string' && Array.isArray(item.types) && item.types.every(type => typeof type === 'string'))
}
function fresh(data, now) {
  const age = now - Date.parse(data.fetchedAt)
  return age >= 0 && age < TTL
}
async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { return null }
}
async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.' + randomUUID() + '.tmp'
  try { await fs.writeFile(tmp, data); await fs.rename(tmp, file) }
  finally { await fs.rm(tmp, { force: true }).catch(() => {}) }
}
function fetcherId(fetcher) {
  if (typeof fetcher !== 'function') throw new Error('Fetch is unavailable')
  if (!fetcherIds.has(fetcher)) fetcherIds.set(fetcher, ++nextFetcherId)
  return fetcherIds.get(fetcher)
}
function merged(key, task) {
  if (inflight.has(key)) return inflight.get(key)
  const pending = Promise.resolve().then(task).finally(() => inflight.delete(key))
  inflight.set(key, pending)
  return pending
}
function trustedPage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'wiki.biligame.com' && !url.port && !url.username && !url.password && url.pathname.startsWith('/nrc/')
  } catch { return false }
}
function trustedImage(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'patchwiki.biligame.com' && !url.port && !url.username && !url.password && url.pathname.startsWith('/images/nrc/') && /\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname)
  } catch { return false }
}
async function readBody(response, limit, binary) {
  if (Number(response.headers?.get?.('content-length')) > limit) throw new Error('Response is too large')
  if (response.body?.getReader) {
    const reader = response.body.getReader()
    const parts = []
    let length = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > limit) { await reader.cancel().catch(() => {}); throw new Error('Response is too large') }
        parts.push(Buffer.from(value))
      }
    } finally { reader.releaseLock() }
    const buffer = Buffer.concat(parts)
    return binary ? buffer : buffer.toString('utf8')
  }
  const data = binary ? Buffer.from(await response.arrayBuffer()) : await response.text()
  if (Buffer.byteLength(data) > limit) throw new Error('Response is too large')
  return data
}
async function request(url, options, binary = false) {
  const fetcher = options.fetcher || globalThis.fetch
  const controller = new AbortController()
  const requestedTimeout = Number(options.timeoutMs ?? (binary ? 10000 : 15000))
  const timeout = Number.isFinite(requestedTimeout) ? Math.max(1, Math.min(requestedTimeout, 30000)) : 15000
  let timer
  const expired = new Promise((resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Trait request timed out')) }, timeout)
  })
  const work = async () => {
    const response = await fetcher(url, { signal: controller.signal, redirect: 'error', headers: { 'User-Agent': 'rocom-plugin trait-dex', Accept: binary ? 'image/png,image/jpeg,image/gif,image/webp' : 'text/html' } })
    if (!response?.ok) throw new Error('HTTP ' + (response?.status ?? 'error'))
    const validate = binary ? trustedImage : trustedPage
    if (response.redirected || (response.url && !validate(response.url))) throw new Error('Untrusted response URL')
    if (binary) {
      const type = response.headers?.get?.('content-type')?.split(';')[0].trim().toLowerCase()
      if (type && !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/octet-stream'].includes(type)) throw new Error('Unsupported image type')
    }
    return readBody(response, binary ? 5 * 1024 * 1024 : 10 * 1024 * 1024, binary)
  }
  try { return await Promise.race([work(), expired]) }
  finally { clearTimeout(timer); controller.abort() }
}

export async function getTraitCatalog(options = {}) {
  const file = path.join(cacheRoot(options), 'catalog.json')
  const now = clock(options)
  const saved = await readJson(file)
  const old = validCatalog(saved) ? saved : snapshot()
  if (!validCatalog(old)) throw new Error('Invalid bundled trait catalog')
  if (!options.forceRefresh && !options.refresh && fresh(old, now)) return structuredClone({ traits: old.traits, fetchedAt: old.fetchedAt, stale: false })
  const fetcher = options.fetcher || globalThis.fetch
  const key = 'catalog:' + file + ':' + fetcherId(fetcher)
  const result = await merged(key, async () => {
    try {
      const html = await request(CATALOG_URL, options)
      const traits = parseTraitCatalog(html)
      const data = { source: CATALOG_URL, fetchedAt: new Date(clock(options)).toISOString(), traits }
      if (!validCatalog(data)) throw new Error('Invalid or empty trait catalog')
      await atomicWrite(file, JSON.stringify(data))
      return { traits: data.traits, fetchedAt: data.fetchedAt, stale: false }
    } catch { return { traits: old.traits, fetchedAt: old.fetchedAt, stale: true } }
  })
  return structuredClone(result)
}
export async function getTraitDetail(trait, options = {}) {
  if (typeof trait === 'string') trait = findTrait(trait).trait
  if (!trait?.url || !trustedPage(trait.url)) throw new Error('Invalid trait URL')
  trait = { ...trait, url: absolute(trait.url) }
  const file = path.join(cacheRoot(options), 'details', digest(trait.url) + '.json')
  const saved = await readJson(file)
  const old = validDetail(saved, trait) ? saved : null
  if (old && !options.forceRefresh && !options.refresh && fresh(old, clock(options))) return { ...old, stale: false }
  const fetcher = options.fetcher || globalThis.fetch
  const key = 'detail:' + file + ':' + fetcherId(fetcher)
  const result = await merged(key, async () => {
    try {
      const html = await request(trait.url, options)
      const data = parseTraitDetail(html, trait, options)
      if (!validDetail(data, trait)) throw new Error('Invalid trait detail')
      await atomicWrite(file, JSON.stringify(data))
      return data
    } catch (error) {
      if (old) return { ...old, stale: true }
      throw error
    }
  })
  return structuredClone(result)
}
function imageExtension(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png'
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return '.jpg'
  if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) return '.gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return '.webp'
  return ''
}
export async function cachedTraitImage(url, options = {}) {
  if (!trustedImage(url)) return ''
  url = new URL(url).href
  const prefix = path.join(cacheRoot(options), 'images', digest(url))
  try {
    for (const ext of ['.png', '.jpg', '.gif', '.webp']) {
      try {
        const buffer = await fs.readFile(prefix + ext)
        if (buffer.length <= 5 * 1024 * 1024 && imageExtension(buffer) === ext) return pathToFileURL(prefix + ext).href
      } catch {}
    }
    const fetcher = options.fetcher || globalThis.fetch
    return await merged('image:' + prefix + ':' + fetcherId(fetcher), async () => {
      try {
        const buffer = await request(url, options, true)
        const ext = imageExtension(buffer)
        if (!ext) return ''
        const file = prefix + ext
        await atomicWrite(file, buffer)
        return pathToFileURL(file).href
      } catch { return '' }
    })
  } catch { return '' }
}
