import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataDir, log } from '../components/index.js'

const BASE = 'https://luokewangguofudan.wiki'
const IMG_DIR = path.join(dataDir, 'hatch_images')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function ensureImgDir() {
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true })
}

/** 精灵图按需下载到本地，返回本地文件名；失败返回空串 */
async function cacheImage(file) {
  if (!file) return ''
  ensureImgDir()
  const save = path.join(IMG_DIR, file)
  try {
    if (fs.existsSync(save) && fs.statSync(save).size > 500) return file
    const res = await fetch(`${BASE}/assets/webp/friends/${file}`, {
      headers: { 'User-Agent': UA, Referer: `${BASE}/` },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 300) return ''
    fs.writeFileSync(save, buf)
    return file
  } catch {
    return ''
  }
}

/**
 * 站点结果由 React Server Components 在服务端渲染。
 * 请求时带 Accept: text/x-component 即可直接拿到含全部候选卡片的 flight 数据，
 * 无需启动浏览器。返回体每行形如 `<id>:<JSON>`，行间用 `$L<id>` 惰性引用。
 */
function parseFlight(raw) {
  const rows = new Map()
  for (const line of raw.split('\n')) {
    const m = /^([0-9a-f]+):(.*)$/.exec(line)
    if (!m) continue
    try {
      rows.set(m[1], JSON.parse(m[2]))
    } catch {
      // I[...] / HL[...] 这类元信息行不是 JSON，跳过
    }
  }
  if (!rows.size) return null

  const resolve = (node, seen) => {
    if (typeof node === 'string') {
      const ref = /^\$L([0-9a-f]+)$/.exec(node)
      if (ref && rows.has(ref[1]) && !seen.has(ref[1])) {
        const next = new Set(seen)
        next.add(ref[1])
        return resolve(rows.get(ref[1]), next)
      }
      return node
    }
    if (Array.isArray(node)) return node.map((item) => resolve(item, seen))
    if (node && typeof node === 'object') {
      const out = {}
      for (const key of Object.keys(node)) out[key] = resolve(node[key], seen)
      return out
    }
    return node
  }

  const rootKey = rows.has('0') ? '0' : [...rows.keys()][0]
  return resolve(rows.get(rootKey), new Set([rootKey]))
}

const tagOf = (node) => (Array.isArray(node) ? node[1] : null)
const propsOf = (node) => (Array.isArray(node) && node[3] && typeof node[3] === 'object' ? node[3] : {})
const kidsOf = (node) => {
  const children = propsOf(node).children
  return Array.isArray(children) ? children : children == null ? [] : [children]
}
const textOf = (node) => {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  return ''
}

/** 从 flight 树里抽出结果卡片（按卡片 key 去重） */
function parseCards(raw) {
  const tree = parseFlight(raw)
  if (!tree) return []

  const cards = []
  const seen = new Set()
  const collect = (node) => {
    if (Array.isArray(node)) {
      if (node[0] === '$' && node[1] === 'article') {
        const key = typeof node[2] === 'string' ? node[2] : ''
        if (!seen.has(key)) {
          seen.add(key)
          cards.push(node)
        }
      }
      node.forEach(collect)
    } else if (node && typeof node === 'object') {
      Object.keys(node).forEach((key) => collect(node[key]))
    }
  }
  collect(tree)

  return cards.map((card) => {
    const out = { prob: 0, name: '', badge: '', number: '', sizeRange: '', weightRange: '', image: '' }
    out.image = (/friends%2F(JL_[A-Za-z0-9_]+\.webp)/.exec(JSON.stringify(card)) || [, ''])[1]

    const visit = (node) => {
      if (!Array.isArray(node)) {
        if (node && typeof node === 'object') Object.keys(node).forEach((key) => visit(node[key]))
        return
      }
      const tag = tagOf(node)
      const props = propsOf(node)
      const cls = typeof props.className === 'string' ? props.className : ''
      const text = textOf(kidsOf(node)).trim()

      if (tag === 'h3') out.name = text
      else if (tag === 'span' && cls.includes('border-primary')) out.badge = text
      else if (tag === 'div' && cls.includes('bottom-5')) out.number = text
      else if (/^[0-9]+(\.[0-9]+)?%$/.test(text)) out.prob = Number(text.replace('%', ''))
      else if (/^[0-9.]+-[0-9.]+ m$/.test(text)) out.sizeRange = text
      else if (/^[0-9.]+-[0-9.]+ kg$/.test(text)) out.weightRange = text

      kidsOf(node).forEach(visit)
    }
    visit(card)
    return out
  })
}

/** 把 `0.56 20.504` 之类的输入拆成尺寸与重量 */
export function parseEggInput(text) {
  const nums = [...String(text || '').matchAll(/[0-9]+(?:\.[0-9]+)?/g)].map((m) => Number(m[0]))
  if (nums.length < 2) return null
  const [size, weight] = nums
  if (!(size > 0) || !(weight > 0)) return null
  if (size > 10 || weight > 1000) return null
  return { size, weight }
}

/** 查询孵蛋结果；无匹配返回 cards 为空数组 */
export async function queryHatch(size, weight) {
  const url = `${BASE}/?size=${size}&weight=${weight}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/x-component' },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) throw new Error(`孵蛋查询失败 HTTP ${res.status}`)
  const raw = await res.text()

  const cards = parseCards(raw).filter((card) => card.name && card.prob > 0)
  if (!cards.length) return { size, weight, cards: [], total: 0 }

  const withImage = await Promise.all(
    cards.map(async (card) => {
      const file = await cacheImage(card.image)
      return {
        ...card,
        image: file ? pathToFileURL(path.join(IMG_DIR, file)).href : '',
        probText: `${Number.isInteger(card.prob) ? card.prob : card.prob.toFixed(2)}%`
      }
    })
  )

  log.d(`孵蛋查询 ${size}m/${weight}kg 命中 ${withImage.length} 只`)
  return { size, weight, cards: withImage, total: withImage.length }
}
