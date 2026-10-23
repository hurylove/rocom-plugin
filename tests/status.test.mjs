import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { collectStatus, statusText, formatChinaDateTime } from '../models/status.js'

function fixture({ updatedAt, active = 1, upcoming = 2, covers = 1, icons = 1, hatch = 1, deliveries = 2 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-status-'))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot, { recursive: true })
  if (updatedAt) {
    fs.writeFileSync(path.join(dataRoot, 'activity_cache.json'), JSON.stringify({
      updatedAt,
      active: Array.from({ length: active }, (_, i) => ({ id: i })),
      upcoming: Array.from({ length: upcoming }, (_, i) => ({ id: 'u' + i }))
    }))
  }
  for (const [dir, n] of [['activity_covers', covers], ['type_icons', icons], ['hatch_images', hatch]]) {
    if (n) {
      fs.mkdirSync(path.join(dataRoot, dir), { recursive: true })
      for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dataRoot, dir, 'f' + i + '.png'), Buffer.alloc(1024))
    }
  }
  if (deliveries) {
    fs.writeFileSync(path.join(dataRoot, 'activity_reminder_state.json'), JSON.stringify({
      deliveries: Object.fromEntries(Array.from({ length: deliveries }, (_, i) => ['k' + i, '2026-01-01T00:00:00Z']))
    }))
  }
  return { root, dataRoot }
}

const now = new Date('2026-10-23T02:00:00Z')
const fresh = new Date('2026-10-23T01:00:00Z')
const proc = { uptime: () => 90061, memoryUsage: () => ({ rss: 150 * 1024 * 1024 }), version: 'v22.16.0' }
const git = () => ({ short: 'abc1234', subject: '测试提交', branch: 'main' })

test('collectStatus 汇总全部四个分区且数值正确', () => {
  const { root, dataRoot } = fixture({ updatedAt: fresh.toISOString() })
  const data = collectStatus({ now, root, dataRoot, proc, git, config: {
    renderScale: 200,
    groupWhite: [123, '456'],
    subscribe: { enable: true, groups: ['111'], keywords: ['稀有'] },
    activityReminder: { enable: true, groups: ['222'], atAllGroups: ['333'], hoursBefore: [24, 6], cacheMaxAgeHours: 48 }
  } })
  assert.equal(data.title, '洛克王国世界')
  assert.equal(data.sections.length, 4)
  assert.deepEqual(data.sections.map((s) => s.name), ['版本与运行', '数据缓存', '订阅配置', '定时任务'])
  const kv = (name, k) => data.sections.find((s) => s.name === name).items.find((i) => i.k === k).v
  assert.equal(kv('版本与运行', 'Git 提交'), 'abc1234')
  assert.equal(kv('版本与运行', '进程运行时长'), '1 天 1 小时 1 分')
  assert.equal(kv('版本与运行', '内存占用'), '150.0 MB')
  assert.equal(kv('数据缓存', '进行中活动'), '1 个')
  assert.equal(kv('数据缓存', '即将开始活动'), '2 个')
  assert.equal(kv('数据缓存', '活动封面'), '1 张 · 1 KB')
  assert.equal(kv('数据缓存', '提醒送达记录'), '2 条')
  assert.ok(kv('数据缓存', '缓存年龄').startsWith('1.0 小时'))
  assert.equal(kv('订阅配置', '群白名单'), '123、456（2 个）')
  assert.equal(kv('订阅配置', '商人订阅'), '开启 · 1 群')
  assert.equal(kv('订阅配置', '活动到期提醒'), '开启 · 1 群订阅')
  assert.equal(kv('订阅配置', '提醒 @全体群'), '333（1 个）')
  assert.equal(kv('订阅配置', '提醒阶段'), '24 / 6 小时')
  assert.ok(kv('定时任务', '活动档案抓取').includes('01:00'))
})

test('缓存接近过期时标记告警，超过 80% 阈值即 warn', () => {
  const { root, dataRoot } = fixture({ updatedAt: new Date('2026-10-21T03:00:00Z').toISOString() })
  const data = collectStatus({ now, root, dataRoot, proc, git, config: {} })
  const ageItem = data.sections.find((s) => s.name === '数据缓存').items.find((i) => i.k === '缓存年龄')
  assert.equal(ageItem.warn, true)
})

test('缓存缺失、目录缺失、git 失败时安全降级不抛错', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-status-empty-'))
  const data = collectStatus({ now, root, dataRoot: path.join(root, 'none'), proc, git: () => { throw new Error('no git') }, config: {} })
  const kv = (name, k) => data.sections.find((s) => s.name === name).items.find((i) => i.k === k)
  assert.equal(kv('版本与运行', 'Git 提交').v, '未知')
  assert.equal(kv('数据缓存', '活动缓存更新').v, '未找到')
  assert.equal(kv('数据缓存', '活动封面').v, '未缓存')
  assert.equal(kv('数据缓存', '提醒送达记录').v, '0 条')
  assert.equal(kv('订阅配置', '群白名单').v, '未设置（全群可用）')
  assert.equal(kv('订阅配置', '活动到期提醒').v, '开启 · 0 群订阅')
  assert.equal(kv('订阅配置', '提醒阶段').v, '24 / 6 小时')
})

test('statusText 输出与图片一致的完整文字', () => {
  const { root, dataRoot } = fixture({ updatedAt: fresh.toISOString() })
  const data = collectStatus({ now, root, dataRoot, proc, git, config: {} })
  const text = statusText(data)
  for (const name of ['版本与运行', '数据缓存', '订阅配置', '定时任务']) assert.ok(text.includes('【' + name + '】'))
  assert.ok(text.includes('· Git 提交：'))
  assert.ok(text.includes('rocom-plugin · 数据截至'))
})

test('formatChinaDateTime 显式 +08:00 不依赖本机时区', () => {
  assert.equal(formatChinaDateTime(new Date('2026-10-23T01:00:00Z')), '2026-10-23 09:00:00')
})

test('apps/status.js 结构符合加载器要求', async () => {
  const source = fs.readFileSync(new URL('../apps/status.js', import.meta.url), 'utf-8')
  assert.ok(source.includes('extends BaseApp'))
  assert.ok(source.includes("reg: '^#?洛克(插件)?状态$'"))
  assert.ok(source.includes('isMaster'))
  assert.ok(!source.includes('this.task = undefined'))
  const help = fs.readFileSync(new URL('../resources/help/help.md', import.meta.url), 'utf-8')
  assert.ok(help.includes('`#洛克状态`：查看插件运行状态'))
  const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf-8')
  assert.ok(readme.includes('`#洛克状态`'))
})
