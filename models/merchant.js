import { log } from '../components/index.js'

export const SOURCE_URL = 'https://www.onebiji.com/hykb_tools/comm/lkwgmerchant/preview.php?id=1&immgj=0'
export const DATA_URL = SOURCE_URL
const SOURCE_NAME = '好游快爆'

/** 与新站一致，按北京时间每日四轮 */
export const slots = [
  { id: 1, name: '第一轮', start: '08:00', end: '12:00' },
  { id: 2, name: '第二轮', start: '12:00', end: '16:00' },
  { id: 3, name: '第三轮', start: '16:00', end: '20:00' },
  { id: 4, name: '第四轮', start: '20:00', end: '24:00' }
]

const beijing = (now) => new Date(now.getTime() + 8 * 3600000)
const toMin = (time) => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
const clockMs = (now) => {
  const date = beijing(now)
  return (date.getUTCHours() * 60 + date.getUTCMinutes()) * 60000 + date.getUTCSeconds() * 1000 + date.getUTCMilliseconds()
}

export function activeSlot(now = new Date()) {
  const minutes = clockMs(now) / 60000
  return slots.find((slot) => minutes >= toMin(slot.start) && minutes < toMin(slot.end)) || null
}

export function slotLeft(slot, now = new Date()) {
  return slot ? Math.max(0, toMin(slot.end) * 60000 - clockMs(now)) : 0
}

export function nextRoundIn(now = new Date()) {
  return activeSlot(now) ? 0 : Math.max(0, 8 * 3600000 - clockMs(now))
}

export function fmtLeft(ms) {
  const total = Math.floor(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return (h ? h + '小时' : '') + m + '分钟'
}

const decode = (value) => String(value)
  .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&nbsp;', ' ')

const displayValue = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '-'
  return String(value).trim() || '-'
}
const numericValue = (value) => {
  const number = Number(String(value).replaceAll(',', ''))
  return Number.isFinite(number) && number >= 0 ? number : 0
}
const imageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, SOURCE_URL)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

/** 页面用 check_N on 标出站点自认的当前时段，用于判断快照是否过期 */
export function currentSlotMarker(html) {
  for (const match of html.matchAll(/<li\s+class="([^"]*)"\s+data-index="(\d)"/g)) {
    if (match[1].split(/\s+/).includes('on')) return Number(match[2])
  }
  return null
}

/** 解析全部商品条目，按 show_N 归入所属时段 */
export function parseItems(html) {
  const items = []
  const parts = html.split('<li class="all_show li_show ')
  for (let i = 1; i < parts.length; i += 1) {
    const block = parts[i].split('</li>')[0]
    const quote = block.indexOf('"')
    if (quote < 0) continue
    const rounds = [...block.slice(0, quote).matchAll(/show_(\d+)/g)].map((m) => Number(m[1]))
    if (!rounds.length) continue

    const info = block.match(/showShopinfo\('([^']*)','([^']*)','([^']*)','([\s\S]*)'\)/)
    const name = (info?.[2] || block.match(/class="shop_name">([^<]*)</)?.[1] || '').trim()
    if (!name) throw new Error('远行商人商品名称解析失败')
    const priceText = (block.match(/class="shop_price">([\s\S]*?)</)?.[1] || '').replace(/^价格[:：]\s*/, '').trim()
    const limitText = (block.match(/限购\s*([^<]*)</)?.[1] || '').trim()
    const currency = decode(block.match(/data-currency="([^"]*)"/)?.[1] || '').trim()
    const category = decode(info?.[3] || '').trim()

    items.push({
      name: decode(name), content: decode(info?.[4] || '').trim(),
      priceText: displayValue(priceText), limitText: displayValue(limitText), currency,
      price: numericValue(priceText), buy_limit: numericValue(limitText),
      img: imageUrl(decode(info?.[1] || '').trim()),
      tags: category ? [category] : [], rounds
    })
  }
  return items
}

/** 只展示当前轮次商品，快照过期时不拿上一轮充数 */
export function parseMerchantSnapshot(html, now = new Date()) {
  const slot = activeSlot(now)
  const result = {
    slot, left: slotLeft(slot, now), next: nextRoundIn(now), goods: [], all: [],
    sourceUrl: SOURCE_URL, sourceName: SOURCE_NAME, notice: '', fetchedAt: '',
    queryTimeText: beijing(now).toISOString().replace('T', ' ').slice(5, 16)
  }
  if (!slot) return result
  if (typeof html !== 'string' || !html.trim()) throw new Error('远行商人页面为空')
  const marker = currentSlotMarker(html)
  if (marker === null) {
    result.notice = '数据源页面结构无法识别，暂不展示商品，请稍后再试。'
    return result
  }
  if (marker !== slot.id) {
    result.notice = '数据源尚未更新到当前北京时间轮次，正在刷新中；暂不展示上一轮商品，请稍后再试。'
    return result
  }
  const all = parseItems(html).map((item) => ({
    ...item, batch: slot.id, state: '在售', long: slots.every((value) => item.rounds.includes(value.id)),
    hot: false, worth: false, timeText: slot.start + ' - ' + slot.end
  }))
  result.goods = all.filter((item) => item.rounds.includes(slot.id))
  result.all = result.goods
  return result
}

export async function fetchCurrentGoods(now = new Date()) {
  if (!activeSlot(now)) return parseMerchantSnapshot(null, now)
  const response = await fetch(DATA_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error('请求失败 HTTP ' + response.status + '：' + DATA_URL)
  const result = parseMerchantSnapshot(await response.text(), now)
  if (result.notice) log.w(result.notice)
  else log.i('从好游快爆抓取 ' + result.goods.length + ' 件当前轮次货物')
  return result
}
