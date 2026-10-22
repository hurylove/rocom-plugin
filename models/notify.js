import { slots, activeSlot } from './merchant.js'
import { config } from '../components/index.js'

const PREFIX = 'rocom:notify:'
const pad = (n) => String(n).padStart(2, '0')

/** 本轮通知的唯一键：日期 + 轮次 */
export function slotKey(now = new Date()) {
  const slot = activeSlot(now)
  if (!slot) return null
  return `${PREFIX}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}:${slot.id}`
}

/** 是否已通知过。Redis 不可用时退化为进程内 Set，避免重复刷屏 */
const local = new Set()

export async function alreadyNotified(key) {
  if (!key) return true
  try {
    return Boolean(await redis.exists(key))
  } catch {
    return local.has(key)
  }
}

export async function markNotified(key, ttl = 8 * 3600) {
  local.add(key)
  try {
    await redis.set(key, '1', { EX: ttl })
  } catch {
    /* Redis 不可用时仅内存标记 */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 抓取当前轮次货物，命中订阅关键词的返回
 * 数据源按轮更新，开轮瞬间可能还是旧数据，故按配置重试
 */
export async function fetchMatched(fetchGoods, now = new Date()) {
  const { retry, retryIntervalSeconds, keywords } = config.subscribe
  const slot = activeSlot(now)
  if (!slot) return { slot: null, matched: [], goods: [] }
  if (!keywords.length) return { slot, matched: [], goods: [] }

  for (let i = 0; i < retry; i++) {
    try {
      const data = await fetchGoods(now)
      const goods = data.goods || []
      const current = goods.filter((g) => g.state === '在售' || g.state === undefined)
      const matched = current.filter((g) => {
        const hay = `${g.name} ${g.content || ''} ${(g.tags || []).join(' ')}`.toLowerCase()
        return keywords.some((k) => hay.includes(k.toLowerCase()))
      })
      if (matched.length || i === retry - 1) return { slot, matched, goods: current, data }
    } catch (err) {
      if (i === retry - 1) throw err
    }
    await sleep(retryIntervalSeconds * 1000)
  }
  return { slot, matched: [], goods: [] }
}

export { slots }
