import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { dataDir, log } from '../components/index.js'

const BASE = 'https://rocom.vip'
export const SOURCE_URL = BASE + '/hatch-query'
const IMG_DIR = path.join(dataDir, 'hatch_images')
const MAX_CARDS = 40
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const text = (value) => typeof value === 'string' ? value.trim() : ''
const finiteNumber = (value) => {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function imageUrl(value) {
  if (!text(value)) return null
  try {
    const url = new URL(value, BASE)
    if (url.protocol !== 'https:' || url.username || url.password ||
        !['rocom.vip', 'rococdn.kekit.vip'].includes(url.host) ||
        !/\.(webp|png|jpe?g)$/i.test(url.pathname)) return null
    return url
  } catch {
    return null
  }
}

async function cacheImage(url) {
  if (!url) return ''
  try {
    // 签名会过期；缓存键只取资源路径，并与旧站图片隔离。
    const key = createHash('sha256').update(url.origin + url.pathname).digest('hex').slice(0, 32)
    const file = path.join(IMG_DIR, 'rocom_' + key + path.extname(url.pathname).toLowerCase())
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return pathToFileURL(file).href
    const res = await fetch(url.href, {
      headers: { 'User-Agent': UA, Referer: SOURCE_URL },
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    })
    if (!res.ok || !/^image\//i.test(res.headers.get('content-type') || '')) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > 5 * 1024 * 1024) return ''
    fs.mkdirSync(IMG_DIR, { recursive: true })
    fs.writeFileSync(file, buf)
    return pathToFileURL(file).href
  } catch {
    return ''
  }
}

function probabilityText(row) {
  const label = text(row.match_probability_text)
  if (label) return label
  const value = finiteNumber(row.match_probability) ?? finiteNumber(row.fit_score)
  return value === null ? '--' : Math.max(0, value).toFixed(1) + '%'
}

function toCard(row) {
  if (!row || typeof row !== 'object' || !text(row.display_name)) {
    throw new Error('孵蛋查询返回了无效的候选数据')
  }
  const preview = row.pet_preview || {}
  const hint = row.height_edge_hint || {}
  const edgeProbability = finiteNumber(hint.probability)
  const edgeProbabilityText = text(hint.probability_text) ||
    (edgeProbability === null ? '' : edgeProbability.toFixed(1) + '%')
  return {
    name: text(row.display_name),
    probText: probabilityText(row),
    badge: text(row.same_ride_label),
    typeName: text(preview.type_name),
    edgeText: text(hint.label) && edgeProbabilityText ? text(hint.label) + ' ' + edgeProbabilityText : '',
    imageUrl: imageUrl(preview.body_url) || imageUrl(preview.avatar_url)
  }
}

function validEgg(size, weight) {
  return Number.isFinite(size) && Number.isFinite(weight) && size > 0 && weight > 0 && size <= 10 && weight <= 1000
}

export function parseEggInput(value) {
  const match = /^\s*(\d+(?:\.\d+)?|\.\d+)(?:\s*(?:m|米)\s*[,，]?\s*|[\s,，]+)(\d+(?:\.\d+)?|\.\d+)\s*(?:kg|千克|公斤)?\s*$/i.exec(String(value ?? ''))
  if (!match) return null
  const size = Number(match[1])
  const weight = Number(match[2])
  return validEgg(size, weight) ? { size, weight } : null
}

export async function queryHatch(size, weight) {
  if (!validEgg(size, weight)) throw new Error('孵蛋查询尺寸或重量无效')
  const params = new URLSearchParams({ height_m: String(size), weight_kg: String(weight) })
  const res = await fetch(BASE + '/api/magic-egg-lookup?' + params, {
    headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SOURCE_URL },
    signal: AbortSignal.timeout(20000),
    redirect: 'error'
  })
  if (!res.ok) throw new Error('孵蛋查询失败 HTTP ' + res.status)
  const payload = await res.json()
  if (payload?.ok !== true) throw new Error('孵蛋查询失败：' + (text(payload?.message) || '站点返回异常'))
  if (!Array.isArray(payload.matched)) throw new Error('孵蛋查询返回格式异常')

  // 保留站点原始顺序和概率文本，包含概率被四舍五入为 0 的候选。
  const matched = payload.matched.map(toCard)
  const cards = matched.slice(0, MAX_CARDS)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(4, cards.length) }, async () => {
    while (next < cards.length) {
      const card = cards[next++]
      card.image = await cacheImage(card.imageUrl)
      delete card.imageUrl
    }
  }))
  log.d('孵蛋查询 ' + size + 'm/' + weight + 'kg 命中 ' + matched.length + ' 个候选（rocom.vip）')
  return { size, weight, cards, total: matched.length, sourceName: '洛克工具箱', sourceUrl: SOURCE_URL }
}
