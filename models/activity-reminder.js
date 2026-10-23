import fs from 'node:fs'
import path from 'node:path'

const HOUR_MS = 60 * 60 * 1000
const DEFAULT_HOURS = [24, 6]
const DEFAULT_CACHE_MAX_AGE_HOURS = 48
const stateLocks = new Map()

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const cleanId = (value) => String(value ?? '').trim()

function resolveNow(now) {
  const value = typeof now === 'function' ? now() : now
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now())
  if (!Number.isFinite(date.getTime())) throw new TypeError('now 必须是有效时间')
  return date
}

function validHours(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 1 && number <= 168
}

export function normalizeReminderOptions(value = {}) {
  const hours = Array.isArray(value.hoursBefore)
    ? [...new Set(value.hoursBefore.map(Number).filter(validHours))].sort((a, b) => b - a)
    : []
  return {
    hoursBefore: hours.length ? hours : [...DEFAULT_HOURS],
    cacheMaxAgeHours: validHours(value.cacheMaxAgeHours)
      ? Number(value.cacheMaxAgeHours)
      : DEFAULT_CACHE_MAX_AGE_HOURS
  }
}

const CHINA_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
const EXPLICIT_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/i

/** 无时区的活动时间一律按中国标准时间（UTC+08:00）解释。 */
export function parseActivityTime(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(value.getTime()) : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  const china = text.match(CHINA_TIME_RE)
  let date
  if (china) {
    const [, year, month, day, hour, minute, second = '00', millis = ''] = china
    const fraction = millis ? '.' + millis.padEnd(3, '0') : ''
    date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}+08:00`)
    if (!Number.isFinite(date.getTime())) return null
    const shifted = new Date(date.getTime() + 8 * HOUR_MS)
    if (shifted.getUTCFullYear() !== Number(year) || shifted.getUTCMonth() + 1 !== Number(month) ||
        shifted.getUTCDate() !== Number(day) || shifted.getUTCHours() !== Number(hour) ||
        shifted.getUTCMinutes() !== Number(minute) || shifted.getUTCSeconds() !== Number(second)) return null
    return date
  }
  if (!EXPLICIT_TIME_RE.test(text)) return null
  date = new Date(text)
  return Number.isFinite(date.getTime()) ? date : null
}

function parseUpdatedAt(value) {
  if (typeof value !== 'string' || !EXPLICIT_TIME_RE.test(value.trim())) return null
  const date = new Date(value.trim())
  return Number.isFinite(date.getTime()) ? date : null
}

const pad = (number) => String(number).padStart(2, '0')

export function formatChinaDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const china = new Date(date.getTime() + 8 * HOUR_MS)
  return `${china.getUTCFullYear()}-${pad(china.getUTCMonth() + 1)}-${pad(china.getUTCDate())} ${pad(china.getUTCHours())}:${pad(china.getUTCMinutes())}`
}

function normalizeActivity(item) {
  if (!isObject(item)) return null
  const id = cleanId(item.id)
  const title = cleanId(item.title)
  const startAt = parseActivityTime(item.start) || parseActivityTime(item.startAt)
  const endAt = parseActivityTime(item.end) || parseActivityTime(item.endAt)
  if (!id || !title || !startAt || !endAt || endAt <= startAt) return null
  return {
    id,
    title,
    category: cleanId(item.category) || '活动',
    rewards: Array.isArray(item.rewards)
      ? item.rewards.map(cleanId).filter(Boolean).join('、')
      : cleanId(item.rewards),
    start: cleanId(item.start) || formatChinaDateTime(startAt),
    end: cleanId(item.end) || formatChinaDateTime(endAt),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    cover: typeof item.cover === 'string' ? item.cover : ''
  }
}

/** 只读取 crawler 持久化缓存；缓存不存在、损坏、过期或时间在未来均拒绝使用。 */
export function readActivityReminderCache({ cachePath, now = new Date(), cacheMaxAgeHours = 48 } = {}) {
  const current = resolveNow(now)
  const { cacheMaxAgeHours: maxAge } = normalizeReminderOptions({ cacheMaxAgeHours })
  if (!cachePath || !fs.existsSync(cachePath)) return { ok: false, reason: 'missing', activities: [] }

  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  } catch {
    return { ok: false, reason: 'corrupt', activities: [] }
  }
  if (!isObject(parsed) || !Array.isArray(parsed.active) || !Array.isArray(parsed.upcoming)) {
    return { ok: false, reason: 'shape', activities: [] }
  }
  const updatedAt = parseUpdatedAt(parsed.updatedAt)
  if (!updatedAt) return { ok: false, reason: 'updatedAt', activities: [] }
  const age = current.getTime() - updatedAt.getTime()
  if (age < 0) return { ok: false, reason: 'future', activities: [] }
  if (age > maxAge * HOUR_MS) return { ok: false, reason: 'stale', activities: [] }

  const activities = new Map()
  for (const raw of [...parsed.active, ...parsed.upcoming]) {
    const item = normalizeActivity(raw)
    if (!item) continue
    const key = JSON.stringify([item.id, item.startAt, item.endAt])
    if (!activities.has(key)) activities.set(key, item)
  }
  return {
    ok: true,
    reason: 'ok',
    updatedAt: updatedAt.toISOString(),
    updatedAtText: formatChinaDateTime(updatedAt),
    activities: [...activities.values()]
  }
}

export function activeActivitiesAt(activities, now = new Date()) {
  const current = resolveNow(now).getTime()
  return (Array.isArray(activities) ? activities : []).filter((item) => {
    const start = new Date(item.startAt).getTime()
    const end = new Date(item.endAt).getTime()
    return Number.isFinite(start) && Number.isFinite(end) && start <= current && current < end
  })
}

/** 最近阶段 = 已跨过阈值中数值最小的阶段；不会回补更早阶段。 */
export function selectReminderStage(endAt, now = new Date(), hoursBefore = DEFAULT_HOURS) {
  const end = endAt instanceof Date ? endAt : new Date(endAt)
  const current = resolveNow(now)
  const remaining = end.getTime() - current.getTime()
  if (!Number.isFinite(end.getTime()) || remaining <= 0) return null
  const stages = normalizeReminderOptions({ hoursBefore }).hoursBefore.slice().sort((a, b) => a - b)
  return stages.find((hours) => remaining <= hours * HOUR_MS) ?? null
}

export function buildReminderKey({ groupId, routeId, activity, stage }) {
  return JSON.stringify({
    group: cleanId(groupId),
    route: cleanId(routeId) || 'default',
    activity: cleanId(activity?.id),
    start: cleanId(activity?.startAt),
    end: cleanId(activity?.endAt),
    stage: Number(stage)
  })
}

function leftText(endAt, now) {
  const remainingMinutes = Math.max(1, Math.ceil((new Date(endAt).getTime() - now.getTime()) / 60000))
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  if (!hours) return `${minutes}分钟`
  return minutes ? `${hours}小时${minutes}分钟` : `${hours}小时`
}

export function selectDueReminderItems({ activities, now = new Date(), hoursBefore, groupId, routeId, deliveries = {} } = {}) {
  const current = resolveNow(now)
  const rows = []
  for (const activity of activeActivitiesAt(activities, current)) {
    const stage = selectReminderStage(activity.endAt, current, hoursBefore)
    if (stage === null) continue
    const key = buildReminderKey({ groupId, routeId, activity, stage })
    if (Object.prototype.hasOwnProperty.call(deliveries, key)) continue
    rows.push({
      key,
      item: {
        id: activity.id,
        title: activity.title,
        category: activity.category,
        rewards: activity.rewards,
        end: activity.end,
        endAt: activity.endAt,
        leftText: leftText(activity.endAt, current),
        hoursBefore: stage,
        cover: activity.cover
      }
    })
  }
  return rows
}

function emptyState() {
  return { version: 1, deliveries: {} }
}

function validateState(value) {
  if (!isObject(value) || value.version !== 1 || !isObject(value.deliveries)) return null
  const deliveries = {}
  for (const [key, deliveredAt] of Object.entries(value.deliveries)) {
    if (!key || typeof deliveredAt !== 'string' || !parseUpdatedAt(deliveredAt)) return null
    deliveries[key] = deliveredAt
  }
  return { version: 1, deliveries }
}

/** 同目录临时文件写入完成后 rename，避免留下半截 JSON。 */
export function writeReminderStateAtomic(statePath, state) {
  if (!statePath) throw new TypeError('statePath 不能为空')
  const directory = path.dirname(statePath)
  fs.mkdirSync(directory, { recursive: true })
  const tempPath = path.join(directory, `.${path.basename(statePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(tempPath, statePath)
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }) } catch {}
    throw error
  }
}

function corruptBackupPath(statePath, now) {
  const stamp = resolveNow(now).toISOString().replace(/[:.]/g, '-')
  let candidate = `${statePath}.corrupt-${stamp}`
  let suffix = 1
  while (fs.existsSync(candidate)) candidate = `${statePath}.corrupt-${stamp}-${suffix++}`
  return candidate
}

/** 损坏状态必须先备份并落盘重建；重建当轮不发送，避免静默退化后立即刷屏。 */
export function loadReminderState({ statePath, now = new Date() } = {}) {
  if (!statePath) throw new TypeError('statePath 不能为空')
  if (!fs.existsSync(statePath)) {
    const state = emptyState()
    writeReminderStateAtomic(statePath, state)
    return { state, created: true, recovered: false, backupPath: '' }
  }

  let text
  try {
    text = fs.readFileSync(statePath, 'utf8')
  } catch (error) {
    throw new Error(`无法读取活动提醒状态：${error.message}`, { cause: error })
  }

  let state = null
  try { state = validateState(JSON.parse(text)) } catch {}
  if (state) return { state, created: false, recovered: false, backupPath: '' }

  const backupPath = corruptBackupPath(statePath, now)
  try {
    fs.renameSync(statePath, backupPath)
    const replacement = emptyState()
    writeReminderStateAtomic(statePath, replacement)
    return { state: replacement, created: false, recovered: true, backupPath }
  } catch (error) {
    throw new Error(`活动提醒状态损坏且无法安全备份/重建：${error.message}`, { cause: error })
  }
}

async function withStateLock(statePath, operation) {
  const key = path.resolve(statePath)
  const previous = stateLocks.get(key) || Promise.resolve()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const tail = previous.catch(() => {}).then(() => gate)
  stateLocks.set(key, tail)
  await previous.catch(() => {})
  try {
    return await operation()
  } finally {
    release()
    if (stateLocks.get(key) === tail) stateLocks.delete(key)
  }
}

function containsErrorStatus(value, seen = new Set(), depth = 0) {
  if (!isObject(value) && !Array.isArray(value)) return false
  if (seen.has(value) || depth > 4) return false
  seen.add(value)
  if (value instanceof Error) return true
  if (isObject(value)) {
    if (value.ok === false || value.success === false) return true
    if (typeof value.retcode === 'number' && value.retcode !== 0) return true
    if (typeof value.code === 'number' && value.code !== 0) return true
    if (typeof value.status === 'string' && /^(?:error|fail(?:ed)?|rejected)$/i.test(value.status.trim())) return true
    if (value.error) return true
  }
  return Object.values(value).some((entry) => containsErrorStatus(entry, seen, depth + 1))
}

export function isSendSuccess(result) {
  return result !== false && result !== null && !(result instanceof Error) && !containsErrorStatus(result)
}

/**
 * 在 statePath 维度串行执行完整的“检查→发送→落盘”，并为每个群独立处理失败。
 * sendReminder 收到 { target, data }，只有非 false 且不含错误状态的结果才算成功。
 */
export async function runActivityReminderCycle({
  cachePath,
  statePath,
  now = () => new Date(),
  hoursBefore = DEFAULT_HOURS,
  cacheMaxAgeHours = DEFAULT_CACHE_MAX_AGE_HOURS,
  targets = [],
  sendReminder
} = {}) {
  if (!statePath) throw new TypeError('statePath 不能为空')
  if (typeof sendReminder !== 'function') throw new TypeError('sendReminder 必须是函数')
  return withStateLock(statePath, async () => {
    const startedAt = resolveNow(now)
    const cache = readActivityReminderCache({ cachePath, now: startedAt, cacheMaxAgeHours })
    const result = { status: 'ok', sent: 0, failed: 0, skipped: 0, errors: [], deliveries: [] }
    if (!cache.ok) return { ...result, status: 'cache-' + cache.reason }

    const loaded = loadReminderState({ statePath, now: startedAt })
    if (loaded.recovered) {
      return { ...result, status: 'state-recovered', backupPath: loaded.backupPath }
    }
    const state = loaded.state

    for (const rawTarget of Array.isArray(targets) ? targets : []) {
      const target = {
        ...rawTarget,
        groupId: cleanId(rawTarget?.groupId),
        routeId: cleanId(rawTarget?.routeId) || 'default'
      }
      if (!target.groupId) {
        result.skipped++
        continue
      }
      // 每个群真正发送前重新取时间并重新过滤，活动已结束时绝不补发。
      const sendAt = resolveNow(now)
      const due = selectDueReminderItems({
        activities: cache.activities,
        now: sendAt,
        hoursBefore,
        groupId: target.groupId,
        routeId: target.routeId,
        deliveries: state.deliveries
      })
      if (!due.length) {
        result.skipped++
        continue
      }
      const data = {
        nowText: formatChinaDateTime(sendAt),
        updatedAt: cache.updatedAtText,
        items: due.map((entry) => entry.item)
      }
      try {
        const response = await sendReminder({ target, data })
        if (!isSendSuccess(response)) throw new Error('发送接口返回失败状态')
        const deliveredAt = sendAt.toISOString()
        for (const entry of due) state.deliveries[entry.key] = deliveredAt
        writeReminderStateAtomic(statePath, state)
        result.sent++
        result.deliveries.push({ groupId: target.groupId, routeId: target.routeId, count: due.length })
      } catch (error) {
        result.failed++
        result.errors.push({ groupId: target.groupId, routeId: target.routeId, message: error?.message || String(error) })
      }
    }
    return result
  })
}

function botIdentity(bot, hint = '') {
  for (const value of [bot?.self_id, bot?.uin, hint]) {
    const id = cleanId(value)
    if (id) return id
  }
  return ''
}

function botCandidates(root) {
  const candidates = []
  const seen = new Set()
  const add = (bot, hint = '', generic = false) => {
    if ((!isObject(bot) && typeof bot !== 'function') || seen.has(bot) || typeof bot.pickGroup !== 'function') return
    seen.add(bot)
    candidates.push({ bot, routeId: botIdentity(bot, hint) || 'default', generic })
  }
  add(root, '', true)
  if (root instanceof Map) {
    for (const [key, value] of root.entries()) add(value, key)
  } else if (Array.isArray(root)) {
    for (const value of root) add(value)
  } else if (isObject(root) || typeof root === 'function') {
    let descriptors = {}
    try { descriptors = Object.getOwnPropertyDescriptors(root) } catch {}
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if ('value' in descriptor) add(descriptor.value, key)
    }
  }
  return candidates
}

/** 只调用实际存在的 pickGroup/sendMsg；多实例也只返回一个确定目标。 */
export async function pickReminderGroup(botRoot, groupId, preferredRoute = '') {
  const id = cleanId(groupId)
  if (!id || !botRoot) return null
  const preferred = cleanId(preferredRoute)
  const candidates = botCandidates(botRoot)
  const ordered = preferred
    ? [...candidates.filter((entry) => !entry.generic && entry.routeId === preferred), ...candidates.filter((entry) => entry.generic), ...candidates.filter((entry) => !entry.generic && entry.routeId !== preferred)]
    : candidates
  const argument = /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : id
  for (const candidate of ordered) {
    try {
      const group = await candidate.bot.pickGroup(argument)
      if (group && typeof group.sendMsg === 'function') {
        return { group, routeId: candidate.routeId, groupId: id }
      }
    } catch {}
  }
  return null
}

/** 命令正则：@全体 分支必须排在普通分支之前，否则「开启」会先吞掉「@全体开启」。 */
export const REMINDER_COMMAND_PATTERN = '^#?\\s*活动提醒\\s*(?:@\\s*全体\\s*(开启|关闭)|(开启|关闭|状态|列表))$'
const REMINDER_COMMAND_RE = new RegExp(REMINDER_COMMAND_PATTERN)

/** 解析提醒命令；不是提醒命令时返回 null，调用方据此放行给其它插件。 */
export function parseReminderCommand(message) {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text) return null
  const match = text.match(REMINDER_COMMAND_RE)
  if (!match) return null
  if (match[1]) return { action: match[1] === '开启' ? 'atAllEnable' : 'atAllDisable', scope: 'atAll' }
  const word = match[2]
  const action = word === '开启' ? 'enable' : word === '关闭' ? 'disable' : 'status'
  return { action, scope: 'reminder' }
}

/** Yunzai 把群成员角色放在 e.sender.role / e.member.role，取值 owner|admin|member。 */
const OPERATOR_ROLES = new Set(['owner', 'admin'])

/** 主人或本群群主/管理员才可变更设置；任何未识别字段一律按无权限处理。 */
export function isReminderOperator(event) {
  if (!isObject(event)) return false
  if (event.isMaster === true) return true
  for (const holder of [event.sender, event.member]) {
    if (!isObject(holder) || typeof holder.role !== 'string') continue
    if (OPERATOR_ROLES.has(holder.role.trim().toLowerCase())) return true
  }
  return false
}

/** 推送目标 = 已订阅群 ∩ 黑白名单放行；@全体名单只做标记，不会把群变成订阅群。 */
export function resolveReminderTargets({ groups, atAllGroups, botRoutes, isAllowed } = {}) {
  const atAll = new Set((Array.isArray(atAllGroups) ? atAllGroups : []).map(cleanId).filter(Boolean))
  const routes = isObject(botRoutes) ? botRoutes : {}
  const seen = new Set()
  const targets = []
  for (const raw of Array.isArray(groups) ? groups : []) {
    const groupId = cleanId(raw)
    if (!groupId || seen.has(groupId)) continue
    if (typeof isAllowed === 'function' && !isAllowed(groupId)) continue
    seen.add(groupId)
    targets.push({ groupId, routeId: cleanId(routes[groupId]), atAll: atAll.has(groupId) })
  }
  return targets
}
