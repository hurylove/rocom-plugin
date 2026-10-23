import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { pluginDir, dataDir } from '../components/paths.js'

const CHINA_MS = 8 * 3600 * 1000
const pad = (n) => String(n).padStart(2, '0')

/** 全部按 UTC 计算后平移 8 小时，显式中国时间，不依赖本机时区。 */
export function formatChinaDateTime(date) {
  const d = new Date(date.getTime() + CHINA_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
}

function sizeText(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
  return bytes + ' B'
}

function dirStats(dir) {
  try {
    let count = 0
    let bytes = 0
    for (const name of fs.readdirSync(dir)) {
      const stat = fs.statSync(path.join(dir, name))
      if (stat.isFile()) {
        count++
        bytes += stat.size
      }
    }
    return { ok: true, count, sizeText: sizeText(bytes) }
  } catch {
    return { ok: false, count: 0, sizeText: '—' }
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function uptimeText(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${days} 天 ${hours} 小时 ${minutes} 分`
  if (hours) return `${hours} 小时 ${minutes} 分`
  return `${minutes} 分`
}

function defaultGit(root) {
  const run = (args) => {
    try {
      return execSync(`git ${args}`, { cwd: root, timeout: 3000, encoding: 'utf-8' }).trim()
    } catch {
      return ''
    }
  }
  const log = run('log -1 --format=%h %s')
  const branch = run('rev-parse --abbrev-ref HEAD')
  const short = log ? log.split(' ')[0] : '未知'
  const subject = log ? log.slice(short.length + 1) : '无法读取 git 信息'
  return { short, subject, branch: branch || '—' }
}

const count = (value) => {
  const list = Array.isArray(value) ? value : []
  return list.length
}

const list = (value) => (Array.isArray(value) ? value : []).map((v) => String(v ?? '').trim()).filter(Boolean)

/**
 * 采集插件运行状态。所有依赖（时间/目录/配置/进程/git）均可注入，便于离线测试。
 */
export function collectStatus({
  now = new Date(),
  root = pluginDir,
  dataRoot = dataDir,
  config = {},
  proc = process,
  git = defaultGit
} = {}) {
  let gitInfo = { short: '未知', subject: '无法读取 git 信息', branch: '—' }
  try {
    gitInfo = git(root) || gitInfo
  } catch {}
  const rss = typeof proc.memoryUsage === 'function' ? proc.memoryUsage().rss : 0

  const reminder = (config && typeof config.activityReminder === 'object' && config.activityReminder) || {}
  const cacheMaxAge = Number(reminder.cacheMaxAgeHours) > 0 ? Number(reminder.cacheMaxAgeHours) : 48
  const cache = readJson(path.join(dataRoot, 'activity_cache.json'))
  let updatedAtText = '未找到'
  let ageText = '—'
  let ageHours = Infinity
  let activeCount = 0
  let upcomingCount = 0
  if (cache && typeof cache.updatedAt === 'string') {
    const updated = Date.parse(cache.updatedAt)
    if (Number.isFinite(updated)) {
      updatedAtText = formatChinaDateTime(new Date(updated))
      ageHours = Math.max(0, (now.getTime() - updated) / 3600000)
      ageText = ageHours.toFixed(1) + ' 小时前'
    }
    activeCount = count(cache.active)
    upcomingCount = count(cache.upcoming)
  }
  const cacheStale = ageHours >= cacheMaxAge * 0.8

  const covers = dirStats(path.join(dataRoot, 'activity_covers'))
  const icons = dirStats(path.join(dataRoot, 'type_icons'))
  const hatch = dirStats(path.join(dataRoot, 'hatch_images'))
  const state = readJson(path.join(dataRoot, 'activity_reminder_state.json'))
  const deliveries = state && typeof state.deliveries === 'object' ? Object.keys(state.deliveries).length : 0

  const subscribe = (config && typeof config.subscribe === 'object' && config.subscribe) || {}
  const renderScale = Number(config.renderScale) > 0 ? Number(config.renderScale) : 100

  const sections = [
    {
      name: '版本与运行',
      items: [
        { k: 'Git 提交', v: `${gitInfo.short}` },
        { k: '分支', v: gitInfo.branch },
        { k: '最新提交说明', v: gitInfo.subject },
        { k: 'Node 版本', v: typeof proc.version === 'string' ? proc.version : '—' },
        { k: '进程运行时长', v: uptimeText(typeof proc.uptime === 'function' ? proc.uptime() : NaN) },
        { k: '内存占用', v: sizeText(rss) }
      ]
    },
    {
      name: '数据缓存',
      items: [
        { k: '活动缓存更新', v: updatedAtText, warn: cacheStale },
        { k: '缓存年龄', v: ageText, warn: cacheStale },
        { k: '进行中活动', v: activeCount + ' 个' },
        { k: '即将开始活动', v: upcomingCount + ' 个' },
        { k: '活动封面', v: covers.ok ? `${covers.count} 张 · ${covers.sizeText}` : '未缓存' },
        { k: '属性图标', v: icons.ok ? `${icons.count} 张 · ${icons.sizeText}` : '未缓存' },
        { k: '孵蛋图缓存', v: hatch.ok ? `${hatch.count} 张 · ${hatch.sizeText}` : '未缓存' },
        { k: '提醒送达记录', v: deliveries + ' 条' }
      ]
    },
    {
      name: '订阅配置',
      items: [
        { k: '渲染缩放', v: renderScale + '%' },
        { k: '群白名单', v: list(config.groupWhite).length ? list(config.groupWhite).join('、') + '（' + list(config.groupWhite).length + ' 个）' : '未设置（全群可用）' },
        { k: '群黑名单', v: list(config.groupBlack).length ? list(config.groupBlack).join('、') + '（' + list(config.groupBlack).length + ' 个）' : '未设置' },
        { k: '商人订阅', v: subscribe.enable ? `开启 · ${list(subscribe.groups).length} 群` : '关闭' },
        { k: '商人订阅关键词', v: subscribe.enable ? (list(subscribe.keywords).length ? list(subscribe.keywords).join('、') : '未设置') : '—' },
        { k: '活动到期提醒', v: reminder.enable === false ? '总开关关闭' : `开启 · ${list(reminder.groups).length} 群订阅` },
        { k: '提醒 @全体群', v: list(reminder.atAllGroups).length ? list(reminder.atAllGroups).join('、') + '（' + list(reminder.atAllGroups).length + ' 个）' : '未设置' },
        { k: '提醒阶段', v: (Array.isArray(reminder.hoursBefore) && reminder.hoursBefore.length ? reminder.hoursBefore : [24, 6]).join(' / ') + ' 小时' }
      ]
    },
    {
      name: '定时任务',
      items: [
        { k: '活动档案抓取', v: '每日 01:00（中国时间）' },
        { k: '活动到期检查', v: '每分钟（仅订阅群，无事项静默）' },
        { k: '商人开轮订阅检查', v: '每日四轮开始（08/12/16/20）' }
      ]
    }
  ]

  return {
    title: '洛克王国世界',
    subtitle: 'rocom-plugin 运行状态',
    gitShort: gitInfo.short,
    sections,
    footer: 'rocom-plugin · 数据截至 ' + formatChinaDateTime(now)
  }
}

/** 图片渲染失败时的文字兜底，内容与图片一致。 */
export function statusText(data) {
  const lines = ['【rocom-plugin 运行状态】']
  for (const section of (data && data.sections) || []) {
    lines.push('')
    lines.push('【' + section.name + '】')
    for (const item of section.items || []) lines.push(`· ${item.k}：${item.v}`)
  }
  lines.push('')
  lines.push(data && data.footer ? data.footer : 'rocom-plugin')
  return lines.join('\n')
}
