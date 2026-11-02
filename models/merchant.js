import { log } from '../components/index.js'

export const SOURCE_URL = 'https://rocokingdomworld.org/zh/merchant/'
export const DATA_URL = 'https://rocokingdomworld.org/data/merchant.json'
const SOURCE_NAME = 'Roco Kingdom World'

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
const stampAt = (minutes, now) => {
  const date = beijing(now)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + minutes * 60000)
    .toISOString().replace('T', ' ').slice(0, 19)
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

const displayValue = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '-'
  return String(value).trim() || '-'
}
const numericValue = (value) => {
  const number = Number(value.replaceAll(',', ''))
  return Number.isFinite(number) && number >= 0 ? number : 0
}
const imageUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    const url = new URL(value, SOURCE_URL)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch { return '' }
}

/** 只接受当前轮次快照，不混用 rounds 中的旧轮次或常驻商品 */
export function parseMerchantSnapshot(snapshot, now = new Date()) {
  const slot = activeSlot(now)
  const result = {
    slot, left: slotLeft(slot, now), next: nextRoundIn(now), goods: [], all: [],
    sourceUrl: SOURCE_URL, sourceName: SOURCE_NAME, notice: '', fetchedAt: '',
    queryTimeText: beijing(now).toISOString().replace('T', ' ').slice(5, 16)
  }
  if (!slot) return result
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items)) {
    throw new Error('新数据源 JSON 商品结构异常')
  }
  result.fetchedAt = typeof snapshot.fetchedAt === 'string' ? snapshot.fetchedAt : ''
  const stale = snapshot.lastFetchError || snapshot.status !== 'open' || snapshot.round !== slot.id ||
    snapshot.startedAtBeijing !== stampAt(toMin(slot.start), now) ||
    snapshot.nextRefreshBeijing !== stampAt(toMin(slot.end), now)
  if (stale) {
    result.notice = '数据源尚未更新到当前北京时间轮次，正在刷新中；暂不展示上一轮商品，请稍后再试。'
    return result
  }
  const all = snapshot.items.map((item) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) throw new Error('新数据源商品名称异常')
    const rounds = Array.isArray(item.rounds) ? item.rounds.map(Number) : []
    const long = slots.every((value) => rounds.includes(value.id))
    const priceText = displayValue(item.price ?? item.priceRaw)
    const limitText = displayValue(item.limit)
    return {
      name: item.name.trim(), content: typeof item.description === 'string' ? item.description : '',
      batch: slot.id, day_batch: long ? '0' : String(slot.id), state: '在售', long,
      tags: typeof item.category === 'string' && item.category.trim() ? [item.category.trim()] : [],
      price: numericValue(priceText), priceText, buy_limit: numericValue(limitText), limitText,
      hot: false, worth: false, img: imageUrl(item.image),
      stime: snapshot.startedAtBeijing, etime: snapshot.nextRefreshBeijing,
      timeText: slot.start + ' - ' + slot.end, rounds
    }
  })
  result.goods = all.filter((item) => !item.rounds.length || item.rounds.includes(slot.id))
  result.all = result.goods
  return result
}

export async function fetchCurrentGoods(now = new Date()) {
  if (!activeSlot(now)) return parseMerchantSnapshot(null, now)
  const response = await fetch(DATA_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) throw new Error('请求失败 HTTP ' + response.status + '：' + DATA_URL)
  const result = parseMerchantSnapshot(await response.json(), now)
  if (result.notice) log.w(result.notice)
  else log.i('从 Roco Kingdom World 抓取 ' + result.goods.length + ' 件当前轮次货物')
  return result
}
