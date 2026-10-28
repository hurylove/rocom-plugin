import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const stateKey = '__rocomMerchantSubscriptionTest'
const state = { config: {}, logs: [] }
globalThis[stateKey] = state
const RealDate = Date
state.ClockDate = class extends RealDate {
  constructor(...args) {
    super(...(args.length ? args : [state.now.getTime()]))
  }
  static now() { return state.now.getTime() }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-merchant-test-'))
const originals = { redis: globalThis.redis, segment: globalThis.segment, fetch: globalThis.fetch }
globalThis.segment = { at: (qq) => ({ type: 'at', qq }) }
globalThis.fetch = async () => { throw new Error('Tests must not use the network') }
after(() => {
  for (const [key, value] of Object.entries(originals)) {
    if (value === undefined) delete globalThis[key]
    else globalThis[key] = value
  }
  delete globalThis[stateKey]
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

const appURL = new URL('../apps/subscribe.js', import.meta.url).href
const notifyURL = new URL('../models/notify.js', import.meta.url).href
const merchantURL = new URL('../models/merchant.js', import.meta.url).href
const dataURL = (source) => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
const prelude = 'const state = globalThis.' + stateKey + ';\n'
const components = dataURL(prelude + [
  'export class BaseApp { constructor(options) { Object.assign(this, options); this.Bot = state.bot } }',
  'export const config = new Proxy({}, { get: (_, name) => state.config[name] });',
  'export const dataDir = state.dataDir;',
  'export const log = Object.fromEntries(["i", "w", "e", "d"].map(level => [level, (...args) => state.logs.push({ level, text: args.map(String).join(" ") })]));'
].join('\n'))
const fetcher = dataURL(prelude + [
  'export async function fetchSnapshot(url) {',
  '  state.fetches.push({ url, at: state.now.getTime() });',
  '  return state.fetchImpl ? state.fetchImpl() : state.snapshot;',
  '}'
].join('\n'))
const renderer = dataURL(prelude + [
  'export async function renderMerchant(data) {',
  '  state.renders.push(data);',
  '  return state.renderImpl ? state.renderImpl(data) : state.image;',
  '}'
].join('\n'))

register(dataURL([
  'const appURL = ' + JSON.stringify(appURL) + ';',
  'const notifyURL = ' + JSON.stringify(notifyURL) + ';',
  'const merchantURL = ' + JSON.stringify(merchantURL) + ';',
  'const targets = [appURL, notifyURL, merchantURL];',
  'export async function resolve(specifier, context, nextResolve) {',
  '  const parent = context.parentURL?.split("?")[0];',
  '  if (targets.includes(parent) && specifier === "../components/index.js") return { url: ' + JSON.stringify(components) + ' + encodeURIComponent(" // " + new URL(context.parentURL).search), shortCircuit: true };',
  '  if (parent === appURL && specifier === "../models/notify.js") {',
  '    const url = new URL(notifyURL); url.search = new URL(context.parentURL).search;',
  '    return { url: url.href, shortCircuit: true };',
  '  }',
  '  if (parent === appURL && specifier === "../render/merchant-renderer.js") return { url: ' + JSON.stringify(renderer) + ', shortCircuit: true };',
  '  if (parent === merchantURL && specifier === "./fetch.js") return { url: ' + JSON.stringify(fetcher) + ', shortCircuit: true };',
  '  return nextResolve(specifier, context);',
  '}',
  'export async function load(url, context, nextLoad) {',
  '  const result = await nextLoad(url, context);',
  '  if (targets.includes(url.split("?")[0])) return { ...result, source: ' + JSON.stringify('const Date = globalThis.' + stateKey + '.ClockDate;\n') + ' + Buffer.from(result.source).toString("utf8") };',
  '  return result;',
  '}'
].join('\n')), import.meta.url)

const at = (hour, minute = 0, second = 0) => new RealDate(2026, 9, 28, hour, minute, second)
const goods = (overrides = {}) => ({
  name: '国王球', content: '', tags: '', stime: '2026-10-28 16:00:00', etime: '2026-10-28 19:59:59',
  day_batch: 3, price: 500, buy_limit: 1, ...overrides
})
const snapshot = (items = [goods()], batch = 3) => ({ list: [{ batch, items }] })
const isImage = (message) => message?.type === 'image'
const isAtAll = (message) => Array.isArray(message) && message.some((part) => part?.type === 'at' && part.qq === 'all')
const notices = (gid) => state.sends.filter((entry) => !isImage(entry.message) && (gid === undefined || entry.gid === String(gid)))
let sequence = 0

async function setup({ store = new Map(), subscribe = {}, now = at(16, 2), dataDir } = {}) {
  Object.assign(state, {
    now, store, dataDir: dataDir || fs.mkdtempSync(path.join(tempRoot, 'case-')), snapshot: snapshot(), image: { type: 'image', file: 'fixture' },
    fetches: [], renders: [], sends: [], logs: [], writes: [],
    fetchImpl: null, renderImpl: null, sendImpl: null, failReads: false, failWrites: false, unavailable: new Set()
  })
  state.config = { subscribe: {
    enable: true, groups: ['101', '102'], keywords: ['国王球'], atAll: true,
    delaySeconds: 120, retry: 2, retryIntervalSeconds: 0, ...subscribe
  } }
  globalThis.redis = {
    async exists(key) {
      if (state.failReads) throw new Error('redis read unavailable')
      return state.store.has(key) ? 1 : 0
    },
    async set(key, value, options) {
      if (state.failWrites) throw new Error('redis write unavailable')
      state.writes.push({ key, value, options })
      state.store.set(key, value)
      return 'OK'
    }
  }
  state.bot = {
    pickGroup(id) {
      const gid = String(id)
      if (state.unavailable.has(gid)) return null
      return {
        async sendMsg(message) {
          state.sends.push({ gid, message })
          return state.sendImpl ? state.sendImpl(gid, message) : { message_id: 'msg-' + state.sends.length }
        }
      }
    }
  }
  const query = '?case=' + (++sequence)
  const [app, notify] = await Promise.all([import(appURL + query), import(notifyURL + query)])
  return { app: new app.RocomSubscribe(), notify }
}

function receipt(notify, gid = '101', when = at(16, 2)) {
  const raw = state.store.get(notify.groupNotifyKey(notify.slotKey(when), gid))
  return raw ? JSON.parse(raw) : undefined
}

function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

test('空数据不会占用通知标记，开轮窗口之后仍补查并按群去重', async () => {
  const { app, notify } = await setup()
  state.snapshot = snapshot([])
  await app.check()
  state.now = at(16, 4)
  await app.check()
  assert.equal(state.fetches.length, 2)
  assert.equal(state.store.size, 0)
  state.now = at(16, 10)
  state.snapshot = snapshot()
  await app.check()
  assert.equal(state.fetches.length, 3)
  assert.equal(notices().length, 2)
  assert.ok(notices().every((entry) => isAtAll(entry.message)))
  assert.ok(notices().every((entry) => entry.message[1] === '\n'))
  assert.equal(state.renders.length, 1)
  assert.equal(state.store.has(notify.slotKey(state.now)), false)
  assert.equal(receipt(notify).mode, 'at_all')
  state.now = at(16, 11)
  await app.check()
  assert.equal(notices().length, 2)
  assert.equal(state.fetches.length, 3)
})

test('本轮暂未命中时不标完成，后续商品更新仍可提醒', async () => {
  const { app } = await setup()
  state.snapshot = snapshot([goods({ name: '翼系粉尘' })])
  await app.check()
  assert.equal(state.store.size, 0)
  state.now = at(17)
  state.snapshot = snapshot()
  await app.check()
  assert.equal(notices().length, 2)
})

test('只匹配本轮在售商品，忽略旧日期和其他轮次', async () => {
  const { app } = await setup()
  state.snapshot = snapshot([goods({ stime: '2026-10-27 16:00:00', etime: '2026-10-27 19:59:59' })])
  await app.check()
  state.snapshot = snapshot([goods()], 2)
  await app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.store.size, 0)
})

test('关键词保持商品描述和标签的大小写不敏感包含匹配', async () => {
  const { app } = await setup({ subscribe: { keywords: ['vIp'] } })
  state.snapshot = snapshot([goods({ name: '礼盒', tags: 'VIP|精品' })])
  await app.check()
  assert.equal(notices().length, 2)
})

test('仅失败群重试，成功群不再收到提醒', async () => {
  const { app, notify } = await setup()
  state.sendImpl = (gid) => {
    if (gid === '102') throw new Error('network unavailable')
    return { message_id: 'ok-101' }
  }
  await app.check()
  assert.equal(receipt(notify, '101').mode, 'at_all')
  assert.equal(receipt(notify, '102'), undefined)
  assert.equal(notices('101').length, 1)
  assert.equal(notices('102').length, 2)
  state.sendImpl = null
  state.now = at(16, 3)
  await app.check()
  assert.equal(notices('101').length, 1)
  assert.equal(notices('102').length, 3)
  assert.equal(receipt(notify, '102').mode, 'at_all')
})

test('@全体失败但文字成功时记录降级，不循环刷文字或再次 @', async () => {
  const { app, notify } = await setup()
  state.sendImpl = (_, message) => {
    if (isAtAll(message)) throw new Error('no at-all quota')
    return { message_id: 'plain-ok' }
  }
  await app.check()
  const saved = receipt(notify)
  assert.equal(saved.mode, 'fallback')
  assert.equal(saved.atAllError, 'no at-all quota')
  assert.equal(saved.status, 'sent')
  await app.check()
  assert.equal(notices().length, 4)
  assert.ok(state.logs.some((entry) => entry.level === 'w' && entry.text.includes('@全体失败')))
})

test('关闭 @全体时仅普通发送，明确失败不会误记成功', async () => {
  const { app, notify } = await setup({ subscribe: { atAll: false } })
  state.sendImpl = () => false
  await app.check()
  assert.equal(state.store.size, 0)
  assert.equal(notices().length, 2)
  state.sendImpl = null
  await app.check()
  assert.equal(receipt(notify).mode, 'plain')
  assert.ok(notices().every((entry) => !isAtAll(entry.message)))
})

test('适配器返回错误状态时不写成功标记', async () => {
  const { app } = await setup()
  state.sendImpl = () => ({ status: 'failed', retcode: 120, wording: 'permission denied' })
  await app.check()
  assert.equal(state.store.size, 0)
  assert.equal(state.renders.length, 0)
})

test('图片发送失败不重发已经送出的文字和 @全体', async () => {
  const { app, notify } = await setup()
  state.sendImpl = (_, message) => {
    if (isImage(message)) throw new Error('image failure')
    return { message_id: 'text-ok' }
  }
  await app.check()
  assert.equal(receipt(notify).mode, 'at_all')
  await app.check()
  assert.equal(notices().length, 2)
  assert.equal(state.renders.length, 1)
})

test('渲染异常不阻断文字通知，也不导致重发', async () => {
  const { app } = await setup()
  state.renderImpl = () => { throw new Error('render failure') }
  await app.check()
  await app.check()
  assert.equal(notices().length, 2)
  assert.equal(state.store.size, 2)
})

test('一分钟调度不会重入尚未完成的检查', async () => {
  const { app } = await setup()
  const started = deferred()
  const response = deferred()
  state.fetchImpl = () => { started.resolve(); return response.promise }
  const first = app.check()
  await started.promise
  await app.check()
  assert.equal(state.fetches.length, 1)
  response.resolve(snapshot())
  await first
  assert.equal(notices().length, 2)
  assert.equal(app.checking, false)
})

test('读取数据跨轮时丢弃旧轮结果，不发送过期提醒', async () => {
  const { app } = await setup({ now: at(19, 59) })
  state.fetchImpl = () => { state.now = at(20); return snapshot() }
  await app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.store.size, 0)
  assert.equal(app.checking, false)
})

test('发送期间跨轮后停止剩余群和旧轮图片', async () => {
  const { app, notify } = await setup({ now: at(19, 59) })
  state.sendImpl = () => { state.now = at(20); return { message_id: 'just-in-time' } }
  await app.check()
  assert.equal(notices('101').length, 1)
  assert.equal(notices('102').length, 0)
  assert.equal(state.renders.length, 0)
  assert.ok(receipt(notify, '101', at(19, 59)))
})

test('检查中取消订阅时不再发送', async () => {
  const { app } = await setup()
  state.fetchImpl = () => { state.config.subscribe.enable = false; return snapshot() }
  await app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.store.size, 0)
})

test('旧版整轮标记保守跳过，不清除也不自动重放', async () => {
  const { app, notify } = await setup()
  const key = notify.slotKey(state.now)
  state.store.set(key, '1')
  await app.check()
  assert.equal(state.fetches.length, 0)
  assert.equal(notices().length, 0)
  assert.equal(state.store.get(key), '1')
  assert.ok(state.logs.some((entry) => entry.text.includes('旧版处理标记')))
})

test('重启后依靠持久化按群标记跳过成功群并继续未成功群', async () => {
  let context = await setup()
  state.unavailable.add('102')
  await context.app.check()
  const store = state.store
  assert.equal(notices().length, 1)
  context = await setup({ store, now: at(16, 20) })
  await context.app.check()
  assert.deepEqual(notices().map((entry) => entry.gid), ['102'])
  assert.ok(receipt(context.notify, '101'))
  assert.ok(receipt(context.notify, '102'))
})

test('下一轮使用独立键，不受上一轮成功标记影响', async () => {
  const { app } = await setup()
  await app.check()
  state.now = at(20, 2)
  state.snapshot = snapshot([goods({ day_batch: 4, stime: '2026-10-28 20:00:00', etime: '2026-10-28 23:59:59' })], 4)
  await app.check()
  assert.equal(notices().length, 4)
  assert.equal(state.store.size, 4)
})

test('默认延迟之前和非营业时间不抓取，秒数不提前向下取整', async () => {
  const { app } = await setup({ now: at(16, 1), subscribe: { delaySeconds: 125 } })
  await app.check()
  state.now = at(16, 2)
  await app.check()
  state.now = at(7)
  await app.check()
  assert.equal(state.fetches.length, 0)
  state.now = at(16, 3)
  await app.check()
  assert.equal(notices().length, 2)
})

test('订阅关闭、没有群或关键词时不检查', async () => {
  for (const subscribe of [{ enable: false }, { groups: [] }, { keywords: [] }]) {
    const { app } = await setup({ subscribe })
    await app.check()
    assert.equal(state.fetches.length, 0)
    assert.equal(state.store.size, 0)
  }
})

test('重复群号不会造成同轮重复发送', async () => {
  const { app } = await setup({ subscribe: { groups: ['101', ' 101 ', 101, '00101', '1.01e2', ''] } })
  await app.check()
  assert.equal(notices().length, 1)
  assert.equal(state.store.size, 1)
})

test('抓取异常有限重试，耗尽后不落成功标记且下一分钟可恢复', async () => {
  const { app } = await setup()
  state.fetchImpl = () => { throw new Error('upstream unavailable') }
  await app.check()
  assert.equal(state.fetches.length, 2)
  assert.equal(state.store.size, 0)
  assert.equal(app.checking, false)
  state.fetchImpl = null
  state.now = at(16, 3)
  await app.check()
  assert.equal(notices().length, 2)
})

test('Redis 状态读取失败时暂停自动通知，而不是把未知当作未通知', async () => {
  const { app } = await setup()
  state.failReads = true
  await app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.fetches.length, 0)
  state.failReads = false
  await app.check()
  assert.equal(notices().length, 2)
})

test('去重写入失败在本进程不重复发送，恢复后补存成功回执', async () => {
  const { app, notify } = await setup()
  state.failWrites = true
  await app.check()
  assert.equal(notices().length, 2)
  assert.equal(state.store.size, 0)
  await app.check()
  assert.equal(notices().length, 2)
  state.failWrites = false
  await app.check()
  assert.equal(notices().length, 2)
  assert.equal(receipt(notify).status, 'sent')
  assert.ok(state.writes.every((entry) => entry.options.EX > 0 && entry.options.EX <= 8 * 3600))
})


test('Redis 写入持续失败后重启仍使用本地回执，不能重复 @全体', async () => {
  let context = await setup()
  state.failWrites = true
  await context.app.check()
  const store = state.store
  const dataDir = state.dataDir
  assert.equal(store.size, 0)
  assert.equal(notices().length, 2)
  assert.ok(fs.existsSync(path.join(dataDir, 'merchant_notify_receipts.json')))
  context = await setup({ store, dataDir, now: at(16, 20) })
  state.failWrites = true
  await context.app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.fetches.length, 0)
  state.failWrites = false
  await context.app.check()
  assert.equal(notices().length, 0)
  assert.equal(store.size, 2)
  assert.equal(receipt(context.notify).mode, 'at_all')
})

test('本地回执损坏时暂停发送并保留原文件，不按空状态重新提醒', async () => {
  const { app } = await setup()
  const file = path.join(state.dataDir, 'merchant_notify_receipts.json')
  fs.writeFileSync(file, '{broken')
  await app.check()
  assert.equal(notices().length, 0)
  assert.equal(state.fetches.length, 0)
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
  assert.ok(state.logs.some((entry) => entry.text.includes('回执无法读取')))
})
