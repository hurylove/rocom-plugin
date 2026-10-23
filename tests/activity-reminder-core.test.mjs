import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  normalizeReminderOptions,
  parseActivityTime,
  readActivityReminderCache,
  activeActivitiesAt,
  selectReminderStage,
  buildReminderKey,
  selectDueReminderItems,
  writeReminderStateAtomic,
  loadReminderState,
  isSendSuccess,
  runActivityReminderCycle,
  pickReminderGroup,
  parseReminderCommand,
  isReminderOperator,
  resolveReminderTargets
} from '../models/activity-reminder.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = (filename) => fs.readFileSync(path.join(root, filename), 'utf8')

/** 每个用例独立的临时目录，绝不触碰仓库里的 data/ 与 config/。 */
function tempDir(prefix = 'rocom-core-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  test.after?.(() => {})
  return dir
}

const HOUR = 60 * 60 * 1000
const BASE = new Date('2026-05-20T00:00:00.000Z') // 中国时间 2026-05-20 08:00
const at = (hoursFromBase) => new Date(BASE.getTime() + hoursFromBase * HOUR)

/** 缓存里 start/end 用 ISO，避免中国时间文本丢失秒导致边界抖动。 */
const activity = (overrides = {}) => ({
  id: 'act-1',
  title: '春日同行',
  category: '限时活动',
  rewards: ['国王球 × 3', '成长果实'],
  start: '2026-05-01T00:00:00.000Z',
  end: '2026-05-21T00:00:00.000Z',
  cover: '',
  ...overrides
})

/** selectDueReminderItems 接收的是 models 归一化后的结构（startAt/endAt 为 ISO）。 */
const normalized = (overrides = {}) => {
  const raw = activity(overrides)
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    rewards: Array.isArray(raw.rewards) ? raw.rewards.join('、') : raw.rewards,
    start: raw.start,
    end: raw.end,
    startAt: new Date(raw.start).toISOString(),
    endAt: new Date(raw.end).toISOString(),
    cover: raw.cover
  }
}

function writeCache(dir, { active = [], upcoming = [activity()], updatedAt = at(0).toISOString() } = {}) {
  const cachePath = path.join(dir, 'activity_cache.json')
  fs.writeFileSync(cachePath, JSON.stringify({ updatedAt, active, upcoming }), 'utf8')
  return cachePath
}

function readState(statePath) {
  return JSON.parse(fs.readFileSync(statePath, 'utf8'))
}

/* ------------------------------------------------------------------ A 配置 */

function loadConfigModule(pluginRoot) {
  const errors = []
  const yamlStub = {
    stringify: (v) => JSON.stringify(v),
    parse: (text) => JSON.parse(text.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n') || '{}')
  }
  const body = source('components/config.js')
    .replace(/^import .*$/gm, '')
    .replace(/^export (?=(?:async )?function)/gm, '')
    .replace(/^export (?=(?:const|let|var|class))/gm, '')
    .replace(/^export \{[^}]*\}$/gm, '')
  const factory = new Function('fs', 'YAML', 'pluginDir', 'logger', body + '\nreturn { DEFAULT_CONFIG, normalizeConfig, loadConfig, saveUserConfig }')
  const mod = factory(fs, yamlStub, pluginRoot, { info: () => {}, error: (...a) => errors.push(a) })
  return { ...mod, errors }
}

test('A1 默认配置包含 activityReminder 契约字段', () => {
  const dir = tempDir('rocom-cfg-')
  const { DEFAULT_CONFIG } = loadConfigModule(dir + path.sep)
  assert.deepEqual(DEFAULT_CONFIG.activityReminder, {
    enable: true, groups: [], atAllGroups: [], hoursBefore: [24, 6], cacheMaxAgeHours: 48
  })
})

test('A2 hoursBefore 去重降序、越界与非数字被丢弃', () => {
  const dir = tempDir('rocom-cfg-')
  const { normalizeConfig } = loadConfigModule(dir + path.sep)
  const conf = normalizeConfig({ activityReminder: { hoursBefore: [6, 24, 6, '24', 0, 169, -3, 'abc', null] } })
  assert.deepEqual(conf.activityReminder.hoursBefore, [24, 6])
  assert.equal(conf.activityReminder.cacheMaxAgeHours, 48)
})

test('A3 无合法 hours 回落 [24,6]，cacheMaxAgeHours 非法回落 48', () => {
  const dir = tempDir('rocom-cfg-')
  const { normalizeConfig } = loadConfigModule(dir + path.sep)
  const conf = normalizeConfig({ activityReminder: { hoursBefore: ['x', 0, 999], cacheMaxAgeHours: 0 } })
  assert.deepEqual(conf.activityReminder.hoursBefore, [24, 6])
  assert.equal(conf.activityReminder.cacheMaxAgeHours, 48)
  const ok = normalizeConfig({ activityReminder: { hoursBefore: [12], cacheMaxAgeHours: 6 } })
  assert.deepEqual(ok.activityReminder.hoursBefore, [12])
  assert.equal(ok.activityReminder.cacheMaxAgeHours, 6)
})

test('A4 群号字符串化、去空白、去重，非法值清空', () => {
  const dir = tempDir('rocom-cfg-')
  const { normalizeConfig } = loadConfigModule(dir + path.sep)
  const conf = normalizeConfig({ activityReminder: { groups: [123, ' 123 ', '456', '', null], atAllGroups: 'not-array' } })
  assert.deepEqual(conf.activityReminder.groups, ['123', '456'])
  assert.deepEqual(conf.activityReminder.atAllGroups, [])
  assert.equal(conf.activityReminder.enable, true)
})

test('A5 saveUserConfig 增量写入并可被 loadConfig 读回', () => {
  const dir = tempDir('rocom-cfg-')
  const { saveUserConfig, loadConfig } = loadConfigModule(dir + path.sep)
  saveUserConfig({ activityReminder: { groups: ['777'] } })
  const userPath = path.join(dir, 'config', 'config.yaml')
  const text = fs.readFileSync(userPath, 'utf8')
  assert.ok(text.includes('777'))
  assert.ok(!text.includes('subscribe'), '未修改的默认段不应被写进用户配置')
  assert.deepEqual(loadConfig().activityReminder.groups, ['777'])
  saveUserConfig({ activityReminder: { atAllGroups: ['777'] } })
  assert.deepEqual(loadConfig().activityReminder.groups, ['777'])
  assert.deepEqual(loadConfig().activityReminder.atAllGroups, ['777'])
})

test('A6 normalizeReminderOptions 自身也做同样的净化', () => {
  assert.deepEqual(normalizeReminderOptions({ hoursBefore: [6, 24, 24], cacheMaxAgeHours: 12 }), { hoursBefore: [24, 6], cacheMaxAgeHours: 12 })
  assert.deepEqual(normalizeReminderOptions({ hoursBefore: [], cacheMaxAgeHours: -1 }), { hoursBefore: [24, 6], cacheMaxAgeHours: 48 })
})

/* ------------------------------------------------------------------ B 命令 */

test('B1 五条命令全部解析正确', () => {
  assert.deepEqual(parseReminderCommand('#活动提醒开启'), { action: 'enable', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('#活动提醒关闭'), { action: 'disable', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('#活动提醒状态'), { action: 'status', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('#活动提醒列表'), { action: 'status', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('#活动提醒@全体开启'), { action: 'atAllEnable', scope: 'atAll' })
  assert.deepEqual(parseReminderCommand('#活动提醒@全体关闭'), { action: 'atAllDisable', scope: 'atAll' })
})

test('B2 容错空格与无井号，非命令返回 null', () => {
  assert.deepEqual(parseReminderCommand('  # 活动提醒 开启 '), { action: 'enable', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('活动提醒状态'), { action: 'status', scope: 'reminder' })
  assert.deepEqual(parseReminderCommand('#活动提醒@全体 开启'), { action: 'atAllEnable', scope: 'atAll' })
  for (const bad of ['#活动提醒', '#活动提醒开启吧', '#订阅开启', '', null, undefined, '#活动提醒删除']) {
    assert.equal(parseReminderCommand(bad), null, '不应匹配：' + bad)
  }
})

test('B3 权限：主人或本群群主/管理员，未识别字段一律拒绝', () => {
  assert.equal(isReminderOperator({ isMaster: true }), true)
  assert.equal(isReminderOperator({ isMaster: false, sender: { role: 'owner' } }), true)
  assert.equal(isReminderOperator({ sender: { role: 'admin' } }), true)
  assert.equal(isReminderOperator({ member: { role: 'ADMIN' } }), true)
  assert.equal(isReminderOperator({ sender: { role: 'member' } }), false)
  assert.equal(isReminderOperator({ isMaster: false, sender: {} }), false)
  assert.equal(isReminderOperator({}), false)
  assert.equal(isReminderOperator(null), false)
})

test('B4 推送目标 = 订阅群 ∩ 黑白名单，@全体 不自动订阅', () => {
  const targets = resolveReminderTargets({
    groups: ['111', ' 222 ', '111', '333'],
    atAllGroups: ['222', '999'],
    botRoutes: { 222: '10001' },
    isAllowed: (id) => id !== '333'
  })
  assert.deepEqual(targets, [
    { groupId: '111', routeId: '', atAll: false },
    { groupId: '222', routeId: '10001', atAll: true }
  ])
  assert.deepEqual(resolveReminderTargets({ groups: ['999'], atAllGroups: ['999'] }), [{ groupId: '999', routeId: '', atAll: true }])
})

/* ------------------------------------------------------------- C/D 缓存与阶段 */

test('C1 缓存过期、损坏、缺失、未来时间、结构不符都被拒绝', () => {
  const dir = tempDir()
  const cachePath = path.join(dir, 'activity_cache.json')
  assert.equal(readActivityReminderCache({ cachePath }).reason, 'missing')

  fs.writeFileSync(cachePath, '{ not json')
  assert.equal(readActivityReminderCache({ cachePath }).reason, 'corrupt')

  fs.writeFileSync(cachePath, JSON.stringify({ active: [], upcoming: [] }))
  assert.equal(readActivityReminderCache({ cachePath }).reason, 'updatedAt')

  fs.writeFileSync(cachePath, JSON.stringify({ updatedAt: at(0).toISOString(), active: [], upcoming: {} }))
  assert.equal(readActivityReminderCache({ cachePath }).reason, 'shape')

  const stale = writeCache(dir, { updatedAt: at(-49).toISOString() })
  assert.equal(readActivityReminderCache({ cachePath: stale, now: at(0) }).reason, 'stale')

  const future = writeCache(dir, { updatedAt: at(2).toISOString() })
  assert.equal(readActivityReminderCache({ cachePath: future, now: at(0) }).reason, 'future')

  const fresh = writeCache(dir, { updatedAt: at(-47).toISOString() })
  const cache = readActivityReminderCache({ cachePath: fresh, now: at(0), cacheMaxAgeHours: 48 })
  assert.equal(cache.ok, true)
})

test('C2 缓存的 active/upcoming 标签不可信，一律按 start/end 重算', () => {
  const dir = tempDir()
  // active 里放一个已经结束的；upcoming 里放一个已经开始且临近结束的
  const cachePath = writeCache(dir, {
    active: [activity({ id: 'ended', title: '已结束', start: '2026-05-01T00:00:00.000Z', end: '2026-05-19T00:00:00.000Z' })],
    upcoming: [activity({ id: 'running', title: '进行中', start: '2026-05-19T00:00:00.000Z', end: '2026-05-21T00:00:00.000Z' })]
  })
  const cache = readActivityReminderCache({ cachePath, now: at(0) })
  assert.equal(cache.ok, true)
  const live = activeActivitiesAt(cache.activities, at(0))
  assert.deepEqual(live.map((item) => item.id), ['running'])
})

test('D1 阶段边界：24h / 6h / 已结束', () => {
  const end = '2026-05-21T00:00:00.000Z'
  assert.equal(selectReminderStage(end, at(0), [24, 6]), 24)          // 恰好 24h
  assert.equal(selectReminderStage(end, new Date(at(0).getTime() + 1), [24, 6]), 24) // 略少于 24h
  assert.equal(selectReminderStage(end, at(-1), [24, 6]), null)        // 25h，尚未进入阶段
  assert.equal(selectReminderStage(end, at(18), [24, 6]), 6)           // 剩 6h
  assert.equal(selectReminderStage(end, at(19), [24, 6]), 6)           // 剩 5h
  assert.equal(selectReminderStage(end, at(24), [24, 6]), null)        // 已结束
})

test('D2 只发最近阶段：5h 只发 6h，不回补 24h；23h 发 24h，随后 5h 发 6h', () => {
  const activities = [normalized()]
  const due5 = selectDueReminderItems({ activities, now: at(19), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries: {} })
  assert.deepEqual(due5.map((d) => d.item.hoursBefore), [6])

  const due23 = selectDueReminderItems({ activities, now: at(1), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries: {} })
  assert.deepEqual(due23.map((d) => d.item.hoursBefore), [24])

  // 24h 已送达后，5h 只补 6h
  const deliveries = { [due23[0].key]: at(1).toISOString() }
  const later = selectDueReminderItems({ activities, now: at(19), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries })
  assert.deepEqual(later.map((d) => d.item.hoursBefore), [6])

  // 6h 也送达后不再重复
  const both = { ...deliveries, [later[0].key]: at(19).toISOString() }
  assert.deepEqual(selectDueReminderItems({ activities, now: at(20), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries: both }), [])
})

test('D3 key 含群、路由、活动、start、end、阶段；延期活动不会互相顶掉', () => {
  const base = { groupId: '1', routeId: 'r1', stage: 6 }
  const a = buildReminderKey({ ...base, activity: { id: 'x', startAt: 'S1', endAt: 'E1' } })
  const b = buildReminderKey({ ...base, activity: { id: 'x', startAt: 'S1', endAt: 'E2' } }) // 延期
  assert.notEqual(a, b)
  assert.notEqual(a, buildReminderKey({ ...base, groupId: '2', activity: { id: 'x', startAt: 'S1', endAt: 'E1' } }))
  assert.notEqual(a, buildReminderKey({ ...base, routeId: 'r2', activity: { id: 'x', startAt: 'S1', endAt: 'E1' } }))
  assert.notEqual(a, buildReminderKey({ ...base, stage: 24, activity: { id: 'x', startAt: 'S1', endAt: 'E1' } }))

  // 同一 id 延期（结束时间后移）后，旧 key 的送达记录不会压制新档期
  const postponedKey = buildReminderKey({
    groupId: '1', routeId: 'r1', stage: 6,
    activity: { id: 'act-1', startAt: '2026-05-01T00:00:00.000Z', endAt: '2026-05-21T00:00:00.000Z' }
  })
  const deliveries = { [postponedKey]: at(19).toISOString() }
  const rows = selectDueReminderItems({
    activities: [normalized({ end: '2026-05-21T06:00:00.000Z' })],
    now: at(24), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries
  })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].item.hoursBefore, 6)
  assert.notEqual(rows[0].key, postponedKey)
})

/* ------------------------------------------------------------- E 状态与发送 */

test('E1 状态文件原子写入，不留临时文件', () => {
  const dir = tempDir()
  const statePath = path.join(dir, 'activity_reminder_state.json')
  writeReminderStateAtomic(statePath, { version: 1, deliveries: { k: at(0).toISOString() } })
  assert.deepEqual(readState(statePath), { version: 1, deliveries: { k: at(0).toISOString() } })
  assert.deepEqual(fs.readdirSync(dir), ['activity_reminder_state.json'])
})

test('E2 损坏状态先备份再重建，且重建当轮不发送', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  fs.writeFileSync(statePath, '{ broken', 'utf8')
  const sent = []
  const result = await runActivityReminderCycle({
    cachePath, statePath, now: () => at(19),
    targets: [{ groupId: '1', routeId: 'r1' }],
    sendReminder: async (payload) => { sent.push(payload); return { message_id: 1 } }
  })
  assert.equal(result.status, 'state-recovered')
  assert.equal(result.sent, 0)
  assert.equal(sent.length, 0)
  assert.ok(result.backupPath && fs.existsSync(result.backupPath))
  assert.deepEqual(readState(statePath), { version: 1, deliveries: {} })
  const loaded = loadReminderState({ statePath, now: at(19) })
  assert.equal(loaded.recovered, false)
})

test('E3 发送返回 false 或抛错都算失败，不落盘，下一分钟重试成功', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  const attempts = []
  const run = (impl) => runActivityReminderCycle({
    cachePath, statePath, now: () => at(19),
    targets: [{ groupId: '1', routeId: 'r1' }], sendReminder: impl
  })

  const falsy = await run(async (p) => { attempts.push('false'); return false })
  assert.equal(falsy.failed, 1)
  assert.equal(falsy.sent, 0)
  assert.deepEqual(readState(statePath).deliveries, {})

  const thrown = await run(async () => { attempts.push('throw'); throw new Error('boom') })
  assert.equal(thrown.failed, 1)
  assert.deepEqual(readState(statePath).deliveries, {})

  const ok = await run(async () => { attempts.push('ok'); return { message_id: 9 } })
  assert.equal(ok.sent, 1)
  assert.equal(Object.keys(readState(statePath).deliveries).length, 1)

  // 新实例（重启）不会重复发送
  const again = await run(async () => { attempts.push('again'); return { message_id: 10 } })
  assert.equal(again.sent, 0)
  assert.deepEqual(attempts, ['false', 'throw', 'ok'])
})

test('E4 一个群失败不影响其它群，多群多路由各自隔离', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  const seen = []
  const result = await runActivityReminderCycle({
    cachePath, statePath, now: () => at(19),
    targets: [
      { groupId: '111', routeId: 'botA' },
      { groupId: '222', routeId: 'botB' },
      { groupId: '333', routeId: 'botC' }
    ],
    sendReminder: async ({ target }) => {
      seen.push(target.groupId + '@' + target.routeId)
      if (target.groupId === '222') throw new Error('群 222 掉线')
      return { message_id: target.groupId }
    }
  })
  assert.equal(result.sent, 2)
  assert.equal(result.failed, 1)
  assert.equal(result.errors[0].groupId, '222')
  assert.deepEqual(seen, ['111@botA', '222@botB', '333@botC'])
  const deliveries = Object.keys(readState(statePath).deliveries)
  assert.equal(deliveries.length, 2)
  assert.ok(!deliveries.some((key) => key.includes('222')))
})

test('E5 并发调用按状态文件串行，只发送一次', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  let sends = 0
  const sendReminder = async () => {
    sends++
    await new Promise((resolve) => setTimeout(resolve, 30))
    return { message_id: sends }
  }
  const run = () => runActivityReminderCycle({
    cachePath, statePath, now: () => at(19),
    targets: [{ groupId: '1', routeId: 'r1' }], sendReminder
  })
  const results = await Promise.all([run(), run(), run()])
  assert.equal(sends, 1)
  assert.equal(results.reduce((sum, r) => sum + r.sent, 0), 1)
})

test('E6 发送前重新过滤：活动已结束时绝不补发', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  let sends = 0
  const result = await runActivityReminderCycle({
    cachePath, statePath, now: () => at(24), // 活动正好结束
    targets: [{ groupId: '1', routeId: 'r1' }],
    sendReminder: async () => { sends++; return { message_id: 1 } }
  })
  assert.equal(sends, 0)
  assert.equal(result.sent, 0)
})

test('E7 无到期事项时完全静默', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir, { updatedAt: at(-5).toISOString() })
  const statePath = path.join(dir, 'activity_reminder_state.json')
  let sends = 0
  const result = await runActivityReminderCycle({
    cachePath, statePath, now: () => at(-5), // 距结束 29h
    targets: [{ groupId: '1', routeId: 'r1' }],
    sendReminder: async () => { sends++; return { message_id: 1 } }
  })
  assert.equal(sends, 0)
  assert.equal(result.skipped, 1)
})

test('E8 缓存不可用时静默返回，不发送', async () => {
  const dir = tempDir()
  const statePath = path.join(dir, 'activity_reminder_state.json')
  const result = await runActivityReminderCycle({
    cachePath: path.join(dir, 'missing.json'), statePath, now: () => at(19),
    targets: [{ groupId: '1', routeId: 'r1' }],
    sendReminder: async () => { throw new Error('不该被调用') }
  })
  assert.equal(result.status, 'cache-missing')
  assert.equal(result.sent, 0)
})

test('E9 isSendSuccess 识别失败状态', () => {
  assert.equal(isSendSuccess({ message_id: 1 }), true)
  assert.equal(isSendSuccess(false), false)
  assert.equal(isSendSuccess(null), false)
  assert.equal(isSendSuccess(new Error('x')), false)
  assert.equal(isSendSuccess({ retcode: 100 }), false)
  assert.equal(isSendSuccess({ status: 'failed' }), false)
})

/* ------------------------------------------------------------- F 路由选择 */

test('F1 优先使用该群记录的路由，取不到再退回通用实例', async () => {
  const calls = []
  const groupOf = (name) => ({ sendMsg: async () => ({ message_id: name }) })
  const botB = { self_id: '10002', pickGroup: (id) => { calls.push('B:' + id); return groupOf('B') } }
  const botA = { self_id: '10001', pickGroup: (id) => { calls.push('A:' + id); return groupOf('A') } }
  const root = { 10001: botA, 10002: botB }

  const preferred = await pickReminderGroup(root, '555', '10002')
  assert.equal(preferred.routeId, '10002')
  assert.deepEqual(calls, ['B:555'])

  calls.length = 0
  const fallback = await pickReminderGroup(root, '555', '99999')
  assert.ok(fallback)
  assert.deepEqual(calls, ['A:555'])
})

test('F2 没有任何可用实例时返回 null，不抛错', async () => {
  assert.equal(await pickReminderGroup(null, '1', '2'), null)
  assert.equal(await pickReminderGroup({}, '1', '2'), null)
})

/* --------------------------------------------------- G 渲染数据形状（契约） */

test('G1 到期项携带渲染器所需字段', () => {
  const rows = selectDueReminderItems({
    activities: [normalized()], now: at(19), hoursBefore: [24, 6], groupId: '1', routeId: 'r1', deliveries: {}
  })
  const item = rows[0].item
  for (const field of ['id', 'title', 'category', 'rewards', 'end', 'endAt', 'leftText', 'hoursBefore', 'cover']) {
    assert.ok(field in item, '缺少字段 ' + field)
  }
  assert.equal(item.hoursBefore, 6)
  assert.match(item.leftText, /5小时/)
})

test('G2 parseActivityTime 只接受明确时间', () => {
  assert.ok(parseActivityTime('2026-05-20 18:00') instanceof Date)
  assert.ok(parseActivityTime('2026-05-20T10:00:00.000Z') instanceof Date)
  assert.equal(parseActivityTime('明天'), null)
  assert.equal(parseActivityTime(''), null)
  assert.equal(parseActivityTime('2026-13-40 25:00'), null)
})


/* ------------------------------------------------- H app 结构与命令行为（注入桩） */

import * as reminderModels from '../models/activity-reminder.js'

/**
 * 用仓库既有做法装载 app：去掉 import/export 后注入桩，
 * 这样不依赖 Yunzai 运行时，也不触碰真实配置与真实发送。
 */
function loadApp({ reminderConfig = {}, allowed = () => true } = {}) {
  const errors = []
  const config = { activityReminder: { enable: true, groups: [], atAllGroups: [], hoursBefore: [24, 6], cacheMaxAgeHours: 48, ...reminderConfig } }
  const patches = []
  const dir = tempDir('rocom-app-')
  // 与 components/base-app.js 保持一致：加 rocom- 前缀、注入 event，task 由子类赋值。
  let superOptions = null
  class BaseAppStub {
    constructor(options) {
      superOptions = options
      this.name = 'rocom-' + options.name
      this.event = 'message'
      this.rule = options.rule
      this.task = []
    }
  }
  const saveUserConfig = (partial) => {
    patches.push(partial)
    config.activityReminder = { ...config.activityReminder, ...partial.activityReminder }
    return config
  }
  const body = source('apps/activity-reminder.js')
    .replace(/^import .*$/gm, '')
    .replace(/^export (?=(?:async )?function)/gm, '')
    .replace(/^export (?=(?:const|let|var|class))/gm, '')
  const factory = new Function(
    'path', 'BaseApp', 'log', 'config', 'getBot', 'isGroupAllowed', 'dataDir', 'reloadConfig', 'saveUserConfig',
    'REMINDER_COMMAND_PATTERN', 'parseReminderCommand', 'isReminderOperator', 'resolveReminderTargets',
    'runActivityReminderCycle', 'readActivityReminderCache', 'pickReminderGroup', 'isSendSuccess',
    body + '\nreturn { RocomActivityReminder }'
  )
  const mod = factory(
    path, BaseAppStub, { i: () => {}, w: (...a) => errors.push(a), e: (...a) => errors.push(a), d: () => {} },
    config, () => null, allowed, dir + path.sep, () => {}, saveUserConfig,
    reminderModels.REMINDER_COMMAND_PATTERN, reminderModels.parseReminderCommand, reminderModels.isReminderOperator,
    reminderModels.resolveReminderTargets, reminderModels.runActivityReminderCycle, reminderModels.readActivityReminderCache,
    reminderModels.pickReminderGroup, reminderModels.isSendSuccess
  )
  const app = new mod.RocomActivityReminder()
  return { app, config, patches, errors, superOptions }
}

/** 伪造 Yunzai 事件：只带仓库里真实使用到的字段。 */
function fakeEvent(overrides = {}) {
  const replies = []
  const event = {
    msg: '#活动提醒状态',
    isGroup: true,
    group_id: 123456,
    self_id: 10001,
    isMaster: false,
    sender: { role: 'member' },
    reply: async (message) => { replies.push(message); return { message_id: replies.length } },
    ...overrides
  }
  return { event, replies }
}

test('H1 app 符合加载器要求：rule/task 均为数组，每分钟静默检查', () => {
  const { app, superOptions } = loadApp()
  assert.equal(app.name, 'rocom-activity-reminder')
  assert.equal(app.event, 'message')
  assert.ok(Array.isArray(superOptions.rule) && superOptions.rule.length === 1)
  assert.equal(typeof superOptions.rule[0].reg, 'string')
  assert.equal(superOptions.rule[0].fnc, 'reminder')
  assert.ok(Array.isArray(superOptions.task), 'task 必须是数组')
  assert.equal(superOptions.task.length, 1)
  assert.equal(superOptions.task[0].cron, '0 * * * * *')
  assert.equal(superOptions.task[0].log, false)
  assert.equal(typeof superOptions.task[0].fnc, 'function')
  // 加载器契约来自 BaseApp，直接核对源文件，避免用桩自证。
  const base = source('components/base-app.js')
  assert.match(base, /event: 'message'/)
  assert.match(base, /this\.task = task/)
  const reg = new RegExp(app.rule[0].reg)
  assert.ok(reg.test('#活动提醒开启'))
  assert.ok(reg.test('#活动提醒@全体关闭'))
  assert.ok(!reg.test('#活动提醒'))
  assert.ok(!reg.test('#订阅开启'))
})

test('H2 非命令消息直接放行，不回复', async () => {
  const { app } = loadApp()
  const { event, replies } = fakeEvent({ msg: '随便聊聊' })
  assert.equal(await app.reminder(event), false)
  assert.deepEqual(replies, [])
})

test('H3 私聊提示去群里操作；黑白名单拦截时完全静默', async () => {
  const { app } = loadApp()
  const priv = fakeEvent({ isGroup: false, isMaster: true, msg: '#活动提醒开启' })
  await app.reminder(priv.event)
  assert.match(priv.replies[0], /群聊/)

  const blocked = loadApp({ allowed: () => false })
  const ev = fakeEvent({ msg: '#活动提醒开启', isMaster: true })
  assert.equal(await blocked.app.reminder(ev.event), false)
  assert.deepEqual(ev.replies, [])
  assert.deepEqual(blocked.patches, [])
})

test('H4 普通成员可查状态但不能改设置', async () => {
  const { app, patches } = loadApp({ reminderConfig: { groups: ['123456'] } })
  const status = fakeEvent({ msg: '#活动提醒状态' })
  await app.reminder(status.event)
  assert.match(status.replies[0], /已开启/)
  assert.match(status.replies[0], /24 小时、6 小时/)

  const list = fakeEvent({ msg: '#活动提醒列表' })
  await app.reminder(list.event)
  assert.match(list.replies[0], /本群活动提醒/)

  const denied = fakeEvent({ msg: '#活动提醒关闭' })
  await app.reminder(denied.event)
  assert.match(denied.replies[0], /只有主人或本群群主\/管理员/)
  assert.deepEqual(patches, [])
})

test('H5 开启写入群号与该群路由，关闭只摘掉本群，其它群不受影响', async () => {
  const { app, config, patches } = loadApp({ reminderConfig: { groups: ['999'] } })
  const admin = { isMaster: false, sender: { role: 'admin' } }

  const on = fakeEvent({ msg: '#活动提醒开启', ...admin })
  await app.reminder(on.event)
  assert.deepEqual(config.activityReminder.groups, ['999', '123456'])
  assert.deepEqual(config.activityReminder.botRoutes, { 123456: '10001' })
  assert.match(on.replies[0], /已开启本群活动到期提醒/)

  const off = fakeEvent({ msg: '#活动提醒关闭', ...admin })
  await app.reminder(off.event)
  assert.deepEqual(config.activityReminder.groups, ['999'])
  assert.equal(patches.length, 2)
  assert.ok(!('atAllGroups' in patches[0].activityReminder), '不应顺手改写无关字段')
})

test('H6 @全体 只标记不订阅群', async () => {
  const { app, config } = loadApp({ reminderConfig: { groups: [] } })
  const ev = fakeEvent({ msg: '#活动提醒@全体开启', isMaster: true })
  await app.reminder(ev.event)
  assert.deepEqual(config.activityReminder.atAllGroups, ['123456'])
  assert.deepEqual(config.activityReminder.groups, [], '@全体 不得自动订阅群')
  assert.match(ev.replies[0], /尚未订阅/)

  const off = fakeEvent({ msg: '#活动提醒@全体关闭', isMaster: true })
  await app.reminder(off.event)
  assert.deepEqual(config.activityReminder.atAllGroups, [])
})

test('H7 总开关关闭时不推送；@全体失败降级为普通提醒', async () => {
  const { app } = loadApp({ reminderConfig: { enable: false, groups: ['123456'] } })
  assert.equal(await app.check(), undefined)

  const sent = []
  const { app: app2 } = loadApp({ reminderConfig: { groups: ['123456'], atAllGroups: ['123456'] } })
  globalThis.segment = { at: (id) => ({ type: 'at', id }) }
  app2.Bot = {
    self_id: 10001,
    pickGroup: () => ({
      sendMsg: async (message) => {
        sent.push(message)
        if (Array.isArray(message) && message[0] && message[0].type === 'at') return { retcode: 100 }
        return { message_id: 1 }
      }
    })
  }
  const ok = await app2.deliver({ groupId: '123456', routeId: '10001', atAll: true }, {
    nowText: '2026-05-20 22:00', updatedAt: '2026-05-20 08:00',
    items: [{ id: 'a', title: '春日同行', category: '限时活动', rewards: '国王球', end: '2026-05-21 08:00', leftText: '5小时', hoursBefore: 6 }]
  })
  assert.equal(sent.length, 2, '@全体 失败后应再发一条普通提醒')
  assert.equal(ok.message_id, 1)
  delete globalThis.segment
})


test('E10 新订阅的群立即补发当前阶段，不影响老群的送达记录', async () => {
  const dir = tempDir()
  const cachePath = writeCache(dir)
  const statePath = path.join(dir, 'activity_reminder_state.json')
  const sends = []
  const run = (targets) => runActivityReminderCycle({
    cachePath, statePath, now: () => at(19),
    targets, sendReminder: async ({ target }) => { sends.push(target.groupId); return { message_id: 1 } }
  })

  await run([{ groupId: '111', routeId: 'r1' }])
  const second = await run([{ groupId: '111', routeId: 'r1' }, { groupId: '222', routeId: 'r1' }])
  assert.equal(second.sent, 1, '只有新订阅的群需要补发')
  assert.deepEqual(sends, ['111', '222'])
  assert.equal(Object.keys(readState(statePath).deliveries).length, 2)
})
