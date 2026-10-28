import fs from 'node:fs'
import path from 'node:path'
import { slots, activeSlot } from './merchant.js'
import { config, dataDir, log } from '../components/index.js'
import { writeReminderStateAtomic } from './activity-reminder.js'

const PREFIX = 'rocom:notify:'
const TTL = 8 * 3600
const pad = (n) => String(n).padStart(2, '0')
const receiptPath = path.join(dataDir, 'merchant_notify_receipts.json')

export function slotKey(now = new Date()) {
  const slot = activeSlot(now)
  if (!slot) return null
  return PREFIX + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + ':' + slot.id
}

export function groupNotifyKey(key, groupId) {
  const raw = String(groupId ?? '').trim()
  const gid = String(Number(raw) || raw)
  return key && gid ? key + ':group:' + gid : null
}

const local = new Map()
let loaded = false

function loadLocal() {
  if (loaded) return
  let saved
  try {
    saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') {
      loaded = true
      return
    }
    throw new Error('商人通知回执无法读取，暂停自动推送')
  }
  if (!saved || saved.version !== 1 || !saved.receipts || typeof saved.receipts !== 'object' || Array.isArray(saved.receipts)) {
    throw new Error('商人通知回执格式异常，暂停自动推送')
  }
  const entries = []
  for (const [key, record] of Object.entries(saved.receipts)) {
    if (!key.startsWith(PREFIX) || !key.includes(':group:') || !record || !Number.isFinite(record.expiresAt) || typeof record.pending !== 'boolean' || typeof record.value !== 'string') {
      throw new Error('商人通知回执条目异常，暂停自动推送')
    }
    let receipt
    try { receipt = JSON.parse(record.value) } catch { throw new Error('商人通知回执内容异常，暂停自动推送') }
    if (receipt?.status !== 'sent') throw new Error('商人通知回执状态异常，暂停自动推送')
    if (record.expiresAt > Date.now()) entries.push([key, record])
  }
  for (const [key, record] of entries) local.set(key, record)
  loaded = true
}

function saveLocal() {
  const receipts = Object.fromEntries([...local].filter(([, record]) => record.value && record.expiresAt > Date.now()))
  writeReminderStateAtomic(receiptPath, { version: 1, receipts })
}

async function persist(key, record) {
  const ttl = Math.ceil((record.expiresAt - Date.now()) / 1000)
  if (ttl <= 0) return
  await redis.set(key, record.value, { EX: ttl })
  record.pending = false
}

async function saveReceipt(key, record) {
  let redisError
  try { await persist(key, record) } catch (err) { redisError = err }
  try {
    saveLocal()
  } catch (err) {
    if (redisError) throw new Error('Redis 和本地回执均无法写入：' + redisError.message + '；' + err.message)
    log.w('商人通知本地副本写入失败，Redis 回执已保存：' + err.message)
  }
  if (redisError) log.w('商人通知 Redis 写入失败，本地回执已保存，等待同步：' + redisError.message)
}

export async function alreadyNotified(key) {
  if (!key) return true
  loadLocal()
  const cached = local.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.pending) {
      try {
        await saveReceipt(key, cached)
      } catch (err) {
        log.w('商人通知回执等待同步，已发送提醒不会重发：' + err.message)
      }
    }
    return true
  }
  local.delete(key)
  // 未知状态不可视为未通知；由调用方暂停推送并等待存储恢复。
  const exists = Boolean(await redis.exists(key))
  if (exists) local.set(key, { expiresAt: Date.now() + TTL * 1000, pending: false })
  return exists
}

export async function markNotified(key, receipt = {}, ttl = TTL) {
  loadLocal()
  for (const [savedKey, record] of local) {
    if (record.expiresAt <= Date.now()) local.delete(savedKey)
  }
  const record = {
    value: JSON.stringify({ ...receipt, status: 'sent', sentAt: new Date().toISOString() }),
    expiresAt: Date.now() + ttl * 1000,
    pending: true
  }
  local.set(key, record)
  await saveReceipt(key, record)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 合法响应立即交回定时检查；仅请求异常在当前调用内有限重试。 */
export async function fetchMatched(fetchGoods, now = new Date()) {
  const { retry, retryIntervalSeconds, keywords } = config.subscribe
  const slot = activeSlot(now)
  if (!slot) return { slot: null, matched: [], goods: [] }
  if (!keywords.length) return { slot, matched: [], goods: [] }

  const attempts = Math.max(1, Math.floor(Number(retry) || 1))
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await fetchGoods(now)
      const goods = (data.goods || []).filter((g) => g.state === '在售' || g.state === undefined)
      const matched = goods.filter((g) => {
        const hay = (g.name + ' ' + (g.content || '') + ' ' + (g.tags || []).join(' ')).toLowerCase()
        return keywords.some((k) => hay.includes(k.toLowerCase()))
      })
      return { slot, matched, goods, data }
    } catch (err) {
      if (i === attempts - 1) throw err
    }
    await sleep(Math.max(0, Number(retryIntervalSeconds) || 0) * 1000)
  }
}

export { slots }
