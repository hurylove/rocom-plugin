import { log } from '../components/index.js'
import { fetchSnapshot } from './fetch.js'

const BASE = 'https://db.18183.com/lkwgyxsr/'

/** 远行商人每日四轮，与 18183 页面保持一致 */
export const slots = [
  { id: 1, name: '第一轮', start: '08:00', end: '12:00' },
  { id: 2, name: '第二轮', start: '12:00', end: '16:00' },
  { id: 3, name: '第三轮', start: '16:00', end: '20:00' },
  { id: 4, name: '第四轮', start: '20:00', end: '24:00' }
]

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 当前所处轮次，非营业时间为 null */
export function activeSlot(now = new Date()) {
  const m = now.getHours() * 60 + now.getMinutes()
  return slots.find((s) => m >= toMin(s.start) && m < toMin(s.end)) || null
}

/** 到轮次结束的剩余毫秒 */
export function slotLeft(slot, now = new Date()) {
  if (!slot) return 0
  const end = toMin(slot.end === '24:00' ? '23:59' : slot.end) * 60 * 1000
  const cur = (now.getHours() * 60 + now.getMinutes()) * 60 * 1000 + now.getSeconds() * 1000
  return Math.max(0, end - cur)
}

/** 距下一轮开始的毫秒，最后一轮结束后到次日 08:00 */
export function nextRoundIn(now = new Date()) {
  const slot = activeSlot(now)
  if (slot) return 0
  const m = now.getHours() * 60 + now.getMinutes()
  const target = m < toMin('08:00') ? toMin('08:00') : toMin('08:00') + 24 * 60
  return (target - m) * 60 * 1000
}

export function fmtLeft(ms) {
  const total = Math.floor(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${h ? h + '小时' : ''}${m}分钟`
}

const stateOf = (item, now) => {
  const s = new Date(String(item.stime).replace(/-/g, '/')).getTime()
  const e = new Date(String(item.etime).replace(/-/g, '/')).getTime()
  if (now < s) return '未开始'
  if (now > e) return '已过期'
  return '在售'
}

const imgOf = (item) => (/^https?:/.test(item.image) ? item.image : BASE + 'outputs/' + item.image)

/** 取当前轮次的在售货物 */
export async function fetchCurrentGoods(now = new Date()) {
  const slot = activeSlot(now)
  const data = await fetchSnapshot(BASE + 'outputs/goods-cache.js')
  const rows = []
  for (const group of data.list || []) {
    for (const item of group.items || []) rows.push({ ...item, batch: Number(group.batch) })
  }
  const nowTs = now.getTime()
  const all = rows.map((item) => ({
    ...item,
    state: stateOf(item, nowTs),
    long: String(item.day_batch) === '0' || new Date(String(item.etime).replace(/-/g, '/')) - new Date(String(item.stime).replace(/-/g, '/')) > 5 * 3600 * 1000,
    tags: String(item.tags || '').split('|').filter(Boolean),
    price: Number(item.price) || 0,
    buy_limit: Number(item.buy_limit) || 0,
    hot: Number(item.is_hot) === 1,
    worth: Number(item.is_worth) === 1,
    img: item.image ? imgOf(item) : '',
    timeText: `${item.stime.slice(11, 16)} - ${item.etime.slice(11, 16)}`
  }))
  const current = slot ? all.filter((x) => x.batch === slot.id) : []
  log.i(`抓取货物 ${all.length} 件，当前轮次 ${slot ? slot.name : '非营业时间'} 共 ${current.length} 件`)
  return { slot, left: slotLeft(slot, now), next: nextRoundIn(now), goods: current, all }
}