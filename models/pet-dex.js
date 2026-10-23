import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataDir } from '../components/paths.js'
import log from '../components/logger.js'

const WIKI_BASE = 'https://wiki.biligame.com'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
const PAGES_DIR = path.join(dataDir, 'pet_dex_pages')
const IMAGES_DIR = path.join(dataDir, 'pet_images')
const DETAIL_TTL_MS = 7 * 86400000

const dataFile = new URL('./pet-dex-data.json', import.meta.url)
const PET_INDEX = JSON.parse(fs.readFileSync(dataFile, 'utf-8'))

const norm = (s) => String(s ?? '').trim().toLowerCase()
// 去标点匹配：让「雪绒鸟春天」也能命中「雪绒鸟（春天的样子）」
const compact = (s) => norm(s).replace(/[（）()\[\]【】\s·、,，.。\-—_:：]/g, '')

/** 展示名：同名多形态时用「名称（形态）」区分，与 Wiki 详情页标题一致。 */
export function displayName(pet) {
  if (!pet) return ''
  return pet.formLabel ? `${pet.name}（${pet.formLabel}）` : pet.name
}

const matchKeys = (pet) => [norm(displayName(pet)), norm(pet.name), compact(pet.name + ' ' + (pet.formLabel || ''))]

/** 匹配分级：0 完全命中、1 前缀、2 包含；-1 不匹配。全名与基础名都参与。 */
function matchScore(pet, kw) {
  const keys = matchKeys(pet)
  const needles = [...new Set([norm(kw), compact(kw)])].filter(Boolean)
  let best = -1
  for (const needle of needles) {
    for (const key of keys) {
      if (!key) continue
      const score = key === needle ? 0 : key.startsWith(needle) ? 1 : key.includes(needle) ? 2 : -1
      if (score >= 0 && (best < 0 || score < best)) best = score
    }
  }
  return best
}

/** 名称搜索：完全匹配 > 前缀 > 包含；同级按编号、再按形态名排序。 */
export function searchPets(keyword, limit = 40) {
  const kw = norm(keyword)
  if (!kw) return []
  const scored = []
  for (const pet of PET_INDEX) {
    const score = matchScore(pet, kw)
    if (score >= 0) scored.push({ pet, score })
  }
  return scored
    .sort((a, b) => a.score - b.score || a.pet.number.localeCompare(b.pet.number) || displayName(a.pet).localeCompare(displayName(b.pet), 'zh'))
    .slice(0, limit)
    .map((s) => s.pet)
}

/** 精确定位：取最优匹配级别，该级唯一即命中，多条返回候选，无命中返回 null。 */
export function findPet(keyword) {
  const kw = norm(keyword)
  if (!kw) return null
  const scored = PET_INDEX.map((pet) => ({ pet, score: matchScore(pet, kw) })).filter((x) => x.score >= 0)
  if (!scored.length) return null
  const best = Math.min(...scored.map((x) => x.score))
  const hits = scored.filter((x) => x.score === best).map((x) => x.pet)
  if (hits.length === 1) return hits[0]
  return { candidates: hits.slice(0, 10), total: hits.length }
}

/** 编号定位：同编号多条进化/形态时返回候选。 */
export function findPetByNumber(number) {
  const num = String(number ?? '').trim().padStart(3, '0')
  const hits = PET_INDEX.filter((p) => p.number === num)
  if (hits.length === 1) return hits[0]
  return hits.length ? { candidates: hits.slice(0, 10), total: hits.length } : null
}

export function petIndexSize() {
  return PET_INDEX.length
}

function readCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** 下载图片到本地缓存，返回 file URL；失败返回空串（渲染层显示占位）。 */
export async function cachedImage(url) {
  if (!url || !/^https?:/.test(url)) return ''
  const name = (url.match(/([a-f0-9]{16,})\.[a-z]+$/i) || [])[1] || String(Math.abs(hash(url)))
  const ext = (url.match(/\.[a-z]+$/i) || ['.png'])[0]
  const file = path.join(IMAGES_DIR, name + ext)
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return pathToFileURL(file).href
  } catch {}
  try {
    fs.mkdirSync(IMAGES_DIR, { recursive: true })
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length) throw new Error('empty body')
    fs.writeFileSync(file, buf)
    return pathToFileURL(file).href
  } catch (err) {
    log.w('[rocom] 精灵图片下载失败：', url, err?.message || err)
    return ''
  }
}

function hash(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()

/** 解析详情页 HTML 为结构化数据；输入可注入，便于离线测试。 */
export function parsePetDetail(html, options = {}) {
  const { pet } = options || {}
  const body = String(html || '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')

  const stats = [...body.matchAll(/roco-stat-name">([^<]+)<\/span>[\s\S]{0,600}?data-val="(\d+)"/g)]
    .map((m) => ({ name: m[1].trim(), value: Number(m[2]) }))

  const pills = []
  for (const m of body.matchAll(/<span class="roco-pill[^"]*">([\s\S]*?)(?=<span class="roco-pill[ "]|<\/div>)/g)) {
    const block = m[1]
    const key = (block.match(/alt="([^"]+)"/) || [])[1]
    const unit = (block.match(/roco-pill-unit">([^<]*)</) || [])[1] || ''
    const text = stripTags(block).replace(unit, '').trim()
    if (key && text) pills.push({ key, value: text + unit })
  }

  // 位置切片：按卡片/时间线/节点起始位置切块，避免嵌套标记截断
  const sliceFrom = (source, startRe, endRes) => {
    const starts = [...source.matchAll(startRe)]
    return starts.map((m) => {
      const from = m.index + m[0].length
      const rest = source.slice(from)
      let len = rest.length
      for (const endRe of endRes) {
        const e = rest.search(endRe)
        if (e >= 0 && e < len) len = e
      }
      return { attrs: m[1] || '', block: rest.slice(0, len) }
    })
  }
  const sliceBlocks = (startRe, endRes) => sliceFrom(body, startRe, endRes)
  const slice2Blocks = (source, startRe, endRes) => sliceFrom(source, startRe, endRes)

  const skills = sliceBlocks(
    /<div class="roco-sk-card"([^>]*)>/g,
    [/<div class="roco-sk-card[ "]/, /class="roco-reference/, /<\/main>/]
  ).map(({ attrs, block }) => ({
    name: stripTags((block.match(/roco-sk-name">([\s\S]*?)<\/div>/) || [])[1]),
    type: (attrs.match(/data-type="([^"]*)"/) || [])[1] || '',
    cat: (attrs.match(/data-cat="([^"]*)"/) || [])[1] || '',
    power: (attrs.match(/data-power="([^"]*)"/) || [])[1] || '',
    source: (attrs.match(/data-source="([^"]*)"/) || [])[1] || '',
    cost: stripTags((block.match(/roco-sk-cost">([\s\S]*?)<\/span>/) || [])[1]).replace(/^\D+/, ''),
    level: stripTags((block.match(/roco-sk-lv">([\s\S]*?)<\/div>/) || [])[1]).replace(/^LV/i, ''),
    desc: stripTags((block.match(/roco-sk-card-desc">([\s\S]*?)<\/div>/) || [])[1])
  })).filter((s) => s.name)

  const branches = []
  const timelines = sliceBlocks(
    /<div class="roco-evo-timeline[^"]*" data-branch="(\d+)">/g,
    [/<div class="roco-evo-timeline/, /class="roco-reference/, /<\/main>/]
  )
  for (const { block } of timelines) {
    const groupName = (block.match(/roco-evo-group-name">([^<]+)</) || [])[1] || ''
    const conns = [...block.matchAll(/roco-evo-conn-pill">[\s\S]*?<span>([^<]+)<\/span>/g)].map((c) => c[1].trim())
    const nodes = slice2Blocks(block, /<div class="roco-evo-node[^"]*" data-roman="([^"]*)">/g, [/<div class="roco-evo-node/, /<div class="roco-evo-branch/, /<\/main>/])
      .map(({ attrs, block: nb }) => ({
        name: (nb.match(/alt="([^"]+)"/) || [])[1] || stripTags((nb.match(/roco-evo-card[^>]*>([\s\S]*?)<img/) || [])[1]),
        roman: attrs || '',
        current: /is-cur/.test(nb.slice(0, 400))
      }))
      .filter((n) => n.name)
    if (nodes.length) branches.push({ name: groupName, nodes, conns })
  }

  const evolveChain = body.match(/roco-evo-branch-btn[^>]*title="([^"]+)"/) ? true : Boolean(branches.length)

  return {
    fetchedAt: new Date().toISOString(),
    stats,
    pills,
    skills,
    branches,
    evolveChain,
    identity: pet ? { number: pet.number, name: pet.name, types: pet.types, form: pet.formLabel, season: pet.season === 'none' ? '' : pet.season } : null
  }
}

/** 取精灵详情：本地缓存 7 天，过期或缺失时抓取详情页并解析。 */
export async function getPetDetail(pet, { force = false, fetcher = null, now = new Date() } = {}) {
  if (!pet || !pet.page) return null
  const cacheFile = path.join(PAGES_DIR, pet.id + '.json')
  if (!force) {
    const cached = readCache(cacheFile)
    if (cached && now.getTime() - Date.parse(cached.fetchedAt) < DETAIL_TTL_MS) return cached
  }
  const url = WIKI_BASE + pet.page
  const doFetch = fetcher || (() => fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) }).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status)
    return r.text()
  }))
  const html = await doFetch(url)
  const detail = parsePetDetail(html, { pet })
  try {
    fs.mkdirSync(PAGES_DIR, { recursive: true })
    fs.writeFileSync(cacheFile, JSON.stringify(detail, null, 1), 'utf-8')
  } catch (err) {
    log.w('[rocom] 精灵详情缓存写入失败：', err?.message || err)
  }
  return detail
}

/** 组装渲染数据：索引 + 详情 + 双立绘本地化。 */
export async function buildPetDexData(pet, detail) {
  const [artNormal, artShiny] = await Promise.all([
    cachedImage(pet.artNormal),
    pet.artShiny ? cachedImage(pet.artShiny) : Promise.resolve('')
  ])
  const statMax = Math.max(150, ...((detail && detail.stats) || []).map((s) => s.value))
  return {
    title: displayName(pet),
    subtitle: 'rocom-plugin 精灵图鉴',
    number: pet.number,
    types: pet.types,
    form: pet.formLabel,
    season: pet.season === 'none' ? '' : pet.season,
    hasShiny: Boolean(pet.artShiny),
    artNormal,
    artShiny,
    stats: ((detail && detail.stats) || []).map((s) => ({ ...s, width: Math.round((s.value / statMax) * 100) })),
    pills: (detail && detail.pills) || [],
    branches: (detail && detail.branches) || [],
    skills: (detail && detail.skills) || [],
    footer: 'rocom-plugin · 数据来源 精灵图鉴'
  }
}
