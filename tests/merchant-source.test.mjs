import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

const componentsURL = new URL('../components/index.js', import.meta.url).href
const rendererURL = new URL('../render/merchant-renderer.js', import.meta.url).href
const componentStub = 'export class BaseApp { constructor(options) { Object.assign(this, options) } } export const log = { i(){}, w(){}, e(){}, d(){} };'
const rendererStub = 'export async function renderMerchant() { return null }'
const loader = 'export async function load(url, context, nextLoad) {' +
  'if (url === ' + JSON.stringify(componentsURL) + ') return {format:"module", source:' + JSON.stringify(componentStub) + ', shortCircuit:true};' +
  'if (url === ' + JSON.stringify(rendererURL) + ') return {format:"module", source:' + JSON.stringify(rendererStub) + ', shortCircuit:true};' +
  'return nextLoad(url, context);}'
register('data:text/javascript;base64,' + Buffer.from(loader).toString('base64'), { parentURL: import.meta.url })
const merchant = await import('../models/merchant.js')
const { RocomMerchant } = await import('../apps/merchant.js')
const now = new Date('2026-11-02T19:00:00+08:00')
const snapshot = (override = {}) => ({
  status: 'open', round: 3, startedAtBeijing: '2026-11-02 16:00:00', nextRefreshBeijing: '2026-11-02 20:00:00',
  fetchedAt: '2026-11-02T11:00:00.000Z', timezone: 'Asia/Shanghai', sourceUrl: 'https://upstream.example/source',
  items: [
    { name: '黑晶琉璃', price: '1,000', limit: '0', image: '/items/crystal.png', category: '炼金材料', description: '示例描述', rounds: [3] },
    { name: '捣蛋糖果*30', price: '5', limit: '1', image: 'https://cdn.example/item.png', category: '活动货币', rounds: [1, 2, 3, 4] }
  ], ...override
})

test('映射价格、限购、品类、描述和图片，并保留旧返回字段', () => {
  const data = merchant.parseMerchantSnapshot(snapshot(), now)
  assert.equal(data.slot.id, 3)
  assert.equal(data.left, 3600000)
  assert.equal(data.next, 0)
  assert.equal(data.goods.length, 2)
  assert.equal(data.goods[0].price, 1000)
  assert.equal(data.goods[0].priceText, '1,000')
  assert.equal(data.goods[0].buy_limit, 0)
  assert.equal(data.goods[0].limitText, '0')
  assert.deepEqual(data.goods[0].tags, ['炼金材料'])
  assert.equal(data.goods[0].content, '示例描述')
  assert.equal(data.goods[0].img, 'https://rocokingdomworld.org/items/crystal.png')
  assert.equal(data.goods[0].state, '在售')
  assert.equal(data.goods[0].batch, 3)
  assert.equal(data.goods[1].long, true)
  assert.equal(data.goods[0].hot, false)
  assert.equal(data.sourceUrl, merchant.SOURCE_URL)
  assert.equal(data.queryTimeText, '11-02 19:00')
})

test('上一轮、上一天及上游报错快照不产生当前库存', () => {
  for (const changed of [
    { round: 2 }, { startedAtBeijing: '2026-11-01 16:00:00' },
    { nextRefreshBeijing: '2026-11-01 20:00:00' }, { status: 'closed' }, { lastFetchError: 'upstream unavailable' }
  ]) {
    const data = merchant.parseMerchantSnapshot(snapshot(changed), now)
    assert.deepEqual(data.goods, [])
    assert.deepEqual(data.all, [])
    assert.match(data.notice, /刷新/)
  }
})

test('意外混入其他轮次的记录不会标为当前在售', () => {
  const body = snapshot()
  body.items.push({ name: '别轮商品', price: '2', limit: '1', rounds: [2] })
  const data = merchant.parseMerchantSnapshot(body, now)
  assert.equal(data.goods.length, 2)
  assert.deepEqual(data.all, data.goods)
})

test('按北京时间计算营业前、四轮边界和最后一分钟', () => {
  const before = new Date('2026-11-02T07:59:59+08:00')
  assert.equal(merchant.activeSlot(before), null)
  assert.equal(merchant.nextRoundIn(before), 1000)
  for (const [hour, id] of [['08', 1], ['12', 2], ['16', 3], ['20', 4]]) {
    const date = new Date('2026-11-02T' + hour + ':00:00+08:00')
    assert.equal(merchant.activeSlot(date).id, id)
    assert.equal(merchant.slotLeft(merchant.activeSlot(date), date), 4 * 3600000)
  }
  const last = new Date('2026-11-02T23:59:59+08:00')
  assert.equal(merchant.slotLeft(merchant.activeSlot(last), last), 1000)
  assert.equal(merchant.activeSlot(new Date('2026-11-03T00:00:00+08:00')), null)
})

test('第四轮跨年结束时间能匹配新站快照', () => {
  const body = snapshot({ round: 4, startedAtBeijing: '2026-12-31 20:00:00', nextRefreshBeijing: '2027-01-01 00:00:00' })
  body.items = [{ name: '跨日商品', price: '3', limit: '1', rounds: [4] }]
  const data = merchant.parseMerchantSnapshot(body, new Date('2026-12-31T23:00:00+08:00'))
  assert.equal(data.goods.length, 1)
  assert.equal(data.left, 3600000)
})

test('缺少数值不会冒充免费或不限，不使用 file 图片地址', () => {
  const body = snapshot({ items: [{ name: '未知商品', image: 'file:///private/secret', rounds: [3] }] })
  const item = merchant.parseMerchantSnapshot(body, now).goods[0]
  assert.equal(item.priceText, '-')
  assert.equal(item.limitText, '-')
  assert.equal(item.img, '')
})

test('结构错误明确失败，合法空列表保持空状态', () => {
  assert.throws(() => merchant.parseMerchantSnapshot({ items: {} }, now), /结构异常/)
  assert.throws(() => merchant.parseMerchantSnapshot(snapshot({ items: [{ price: '1' }] }), now), /名称异常/)
  const empty = merchant.parseMerchantSnapshot(snapshot({ items: [] }), now)
  assert.deepEqual(empty.goods, [])
  assert.equal(empty.notice, '')
})

test('只抓取新站 JSON，禁用缓存且不携带旧站凭据', async (t) => {
  let request
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify(snapshot()), { status: 200 })
  })
  const data = await merchant.fetchCurrentGoods(now)
  assert.equal(request.url, 'https://rocokingdomworld.org/data/merchant.json')
  assert.equal(request.options.cache, 'no-store')
  assert.equal(request.options.credentials, 'omit')
  const headers = new Headers(request.options.headers)
  assert.equal(headers.get('authorization'), null)
  assert.equal(headers.get('cookie'), null)
  assert.equal(data.goods.length, 2)
})

test('HTTP 错误不回退旧数据源', async (t) => {
  let count = 0
  t.mock.method(globalThis, 'fetch', async () => { count++; return new Response('', { status: 503 }) })
  await assert.rejects(merchant.fetchCurrentGoods(now), /HTTP 503/)
  assert.equal(count, 1)
})

test('非营业时间不请求网络，保留下一轮倒计时', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('不应请求') })
  const closed = await merchant.fetchCurrentGoods(new Date('2026-11-02T04:00:00+08:00'))
  assert.equal(mock.mock.callCount(), 0)
  assert.equal(closed.slot, null)
  assert.equal(closed.next, 4 * 3600000)
  assert.deepEqual(closed.goods, [])
})

test('文字兜底显示来源、真实限购和更新提示', () => {
  const app = new RocomMerchant()
  const extra = { leftText: '1小时', nextText: '0分钟' }
  const text = app.textFallback(merchant.parseMerchantSnapshot(snapshot(), now), extra)
  assert.match(text, /1,000/)
  assert.match(text, /限购 0/)
  assert.match(text, /rocokingdomworld\.org\/zh\/merchant\//)
  const staleText = app.textFallback(merchant.parseMerchantSnapshot(snapshot({ round: 2 }), now), extra)
  assert.match(staleText, /正在刷新/)
  assert.doesNotMatch(staleText, /黑晶琉璃/)
})
