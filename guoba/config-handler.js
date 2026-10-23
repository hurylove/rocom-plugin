import { loadConfig, saveUserConfig } from '../components/config.js'

const DEFAULT_SUBSCRIBE = {
  enable: false,
  groups: [],
  atAll: true,
  keywords: [],
  delaySeconds: 120,
  retry: 5,
  retryIntervalSeconds: 30
}
const DEFAULT_REMINDER = {
  enable: true,
  groups: [],
  atAllGroups: [],
  hoursBefore: [24, 6],
  cacheMaxAgeHours: 48
}
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value)
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined
const toArray = (value) => {
  const values = Array.isArray(value) ? value : String(value ?? '').split(/[,，\s]+/)
  return [...new Set(values.map((item) => String(item ?? '').trim()).filter(Boolean))]
}
const toNumber = (value, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
const toBoolean = (value, fallback) => {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'false' || value.trim() === '0') return false
    if (value.trim().toLowerCase() === 'true' || value.trim() === '1') return true
  }
  return Boolean(value)
}
const validHours = (value) => {
  const hours = Number(value)
  return Number.isFinite(hours) && hours >= 1 && hours <= 168
}
const toHours = (value) => {
  const hours = [...new Set(toArray(value).map(Number).filter(validHours))].sort((a, b) => b - a)
  return hours.length ? hours : [...DEFAULT_REMINDER.hoursBefore]
}
const toCacheHours = (value) => validHours(value) ? Number(value) : DEFAULT_REMINDER.cacheMaxAgeHours

/** 嵌套配置 → 扁平表单字段 */
export function getConfigData() {
  const c = loadConfig() || {}
  const s = { ...DEFAULT_SUBSCRIBE, ...(isObject(c.subscribe) ? c.subscribe : {}) }
  const a = { ...DEFAULT_REMINDER, ...(isObject(c.activityReminder) ? c.activityReminder : {}) }
  return {
    renderScale: toNumber(c.renderScale, 200),
    groupWhite: toArray(c.groupWhite),
    groupBlack: toArray(c.groupBlack),
    subscribeEnable: toBoolean(s.enable, false),
    subscribeGroups: toArray(s.groups),
    subscribeAtAll: toBoolean(s.atAll, true),
    subscribeKeywords: toArray(s.keywords),
    subscribeDelaySeconds: toNumber(s.delaySeconds, 120),
    subscribeRetry: toNumber(s.retry, 5),
    subscribeRetryIntervalSeconds: toNumber(s.retryIntervalSeconds, 30),
    activityReminderEnable: toBoolean(a.enable, true),
    activityReminderGroups: toArray(a.groups),
    activityReminderAtAllGroups: toArray(a.atAllGroups),
    activityReminderHoursBefore: toHours(a.hoursBefore),
    activityReminderCacheMaxAgeHours: toCacheHours(a.cacheMaxAgeHours)
  }
}

/** 只保存本次表单实际提交的字段，保留其他配置及内部路由 */
export function setConfigData(data = {}) {
  if (!isObject(data)) return
  const partial = {}
  if (has(data, 'renderScale')) partial.renderScale = toNumber(data.renderScale, 200)
  if (has(data, 'groupWhite')) partial.groupWhite = toArray(data.groupWhite)
  if (has(data, 'groupBlack')) partial.groupBlack = toArray(data.groupBlack)

  const saveSection = (section, fields) => {
    const submitted = fields.filter(([field]) => has(data, field))
    if (!submitted.length) return
    const current = loadConfig() || {}
    const next = { ...(isObject(current[section]) ? current[section] : {}) }
    for (const [field, key, normalize] of submitted) next[key] = normalize(data[field])
    partial[section] = next
  }
  saveSection('subscribe', [
    ['subscribeEnable', 'enable', (value) => toBoolean(value, false)],
    ['subscribeGroups', 'groups', toArray],
    ['subscribeAtAll', 'atAll', (value) => toBoolean(value, true)],
    ['subscribeKeywords', 'keywords', toArray],
    ['subscribeDelaySeconds', 'delaySeconds', (value) => toNumber(value, 120)],
    ['subscribeRetry', 'retry', (value) => toNumber(value, 5)],
    ['subscribeRetryIntervalSeconds', 'retryIntervalSeconds', (value) => toNumber(value, 30)]
  ])
  saveSection('activityReminder', [
    ['activityReminderEnable', 'enable', (value) => toBoolean(value, true)],
    ['activityReminderGroups', 'groups', toArray],
    ['activityReminderAtAllGroups', 'atAllGroups', toArray],
    ['activityReminderHoursBefore', 'hoursBefore', toHours],
    ['activityReminderCacheMaxAgeHours', 'cacheMaxAgeHours', toCacheHours]
  ])
  if (Object.keys(partial).length) saveUserConfig(partial)
}
