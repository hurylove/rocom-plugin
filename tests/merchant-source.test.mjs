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

const entry = (rounds, { name, price, limit, currency = '洛克贝', category = '炼金材料', img = '', desc = '' }) =>
  '<li class="all_show li_show ' + rounds.map((r) => 'show_' + r).join(' ') + '  " style="display:none" data-currency="' + currency + '" ' +
  "onclick=\"showShopinfo('" + img + "','" + name + "','" + category + "','" + desc + "')\">" +
  '<div class="gitem"><img src="' + img + '" alt=""><em>限购' + limit + '</em></div>' +
  '<div class="sp-text"><p><em class="shop_name">' + name + '</em></p>' +
  '<div><em class="shop_price">价格：' + price + ' </em></div></div></li>'

const page = (items, activeRound = 3) => {
  const tabs = [1, 2, 3, 4].map((n) =>
    '<li class="check_' + n + (n === activeRound ? ' on' : ' ') + '" data-index="' + n + '">' +
    '<em>0' + (n * 4) + ':00</em><i></i><em>0' + (n * 4 + 4) + ':00</em></li>').join('')
  return '<html><body><div class="time-box"><ul class="time-list">' + tabs + '</ul></div>' +
    '<div class="shop-con"><ul class="shop-list">' + items.join('') + '</ul></div></body></html>'
}

const sample = () => page([
  entry([3], { name: '黑晶琉璃', price: '1000', limit: '100', img: 'https://patchwiki.biligame.com/x.png', desc: '示例描述' }),
  entry([1, 2, 3, 4], { name: '捣蛋糖果*30', price: '5', limit: '1', currency: '蜂窝', category: '活动货币' })
])

test('解析商品名称、价格、限购、货币、品类、描述和图片', () => {
  const data = merchant.parseMerchantSnapshot(sample(), now)
  assert.equal(data.slot.id, 3)
  assert.equal(data.left, 3600000)
  assert.equal(data.next, 0)
  assert.equal(data.goods.length, 2)
  const [first, second] = data.goods
  assert.equal(first.name, '黑晶琉璃')
  assert.equal(first.priceText, '1000')
  assert.equal(first.price, 1000)
  assert.equal(first.limitText, '100')
  assert.equal(first.currency, '洛克贝')
  assert.deepEqual(first.tags, ['炼金材料'])
  assert.equal(first.content, '示例描述')
  assert.equal(first.img, 'https://patchwiki.biligame.com/x.png')
  assert.equal(first.state, '在售')
  assert.equal(first.batch, 3)
  assert.equal(first.long, false)
  assert.equal(second.currency, '蜂窝')
  assert.equal(second.long, true)
  assert.equal(data.sourceUrl, merchant.SOURCE_URL)
  assert.equal(data.sourceName, '好游快爆')
  assert.equal(data.queryTimeText, '11-02 19:00')
})

test('保留原文价格写法，不把 160w 变成数字', () => {
  const html = page([entry([3], { name: '炫彩蛋', price: '160w', limit: '1' })])
  const item = merchant.parseMerchantSnapshot(html, now).goods[0]
  assert.equal(item.priceText, '160w')
  assert.equal(item.price, 0)
})

test('页面标记的时段与当前北京时间不一致时不展示商品', () => {
  for (const activeRound of [1, 2, 4]) {
    const data = merchant.parseMerchantSnapshot(page([entry([3], { name: '旧货', price: '1', limit: '1' })], activeRound), now)
    assert.deepEqual(data.goods, [])
    assert.deepEqual(data.all, [])
    assert.match(data.notice, /刷新/)
  }
})

test('页面没有时段标记时明确提示而不猜测', () => {
  const data = merchant.parseMerchantSnapshot('<html><body>维护中</body></html>', now)
  assert.deepEqual(data.goods, [])
  assert.match(data.notice, /无法识别/)
})

test('只取当前轮次，常驻商品出现在每一轮', () => {
  const html = page([
    entry([3], { name: '本轮', price: '1', limit: '1' }),
    entry([2], { name: '上轮', price: '2', limit: '1' }),
    entry([1, 2, 3, 4], { name: '常驻', price: '3', limit: '1' })
  ])
  const data = merchant.parseMerchantSnapshot(html, now)
  assert.deepEqual(data.goods.map((g) => g.name), ['本轮', '常驻'])
  assert.deepEqual(data.all, data.goods)
})

test('营业前、四轮边界与最后一分钟按北京时间计算', () => {
  assert.equal(merchant.activeSlot(new Date('2026-11-02T07:59:59+08:00')), null)
  assert.equal(merchant.nextRoundIn(new Date('2026-11-02T07:59:59+08:00')), 1000)
  for (const [hour, id] of [['08', 1], ['12', 2], ['16', 3], ['20', 4]]) {
    const date = new Date('2026-11-02T' + hour + ':00:00+08:00')
    assert.equal(merchant.activeSlot(date).id, id)
    assert.equal(merchant.slotLeft(merchant.activeSlot(date), date), 4 * 3600000)
  }
  const last = new Date('2026-11-02T23:59:59+08:00')
  assert.equal(merchant.slotLeft(merchant.activeSlot(last), last), 1000)
  assert.equal(merchant.activeSlot(new Date('2026-11-03T00:00:00+08:00')), null)
})

test('非营业时间不请求网络', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('不应请求') })
  const closed = await merchant.fetchCurrentGoods(new Date('2026-11-02T04:00:00+08:00'))
  assert.equal(mock.mock.callCount(), 0)
  assert.equal(closed.slot, null)
  assert.equal(closed.next, 4 * 3600000)
  assert.deepEqual(closed.goods, [])
})

test('只抓取 onebiji 页面，禁用缓存且不带凭据', async (t) => {
  let request
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options }
    return new Response(sample(), { status: 200 })
  })
  const data = await merchant.fetchCurrentGoods(now)
  assert.equal(request.url, merchant.SOURCE_URL)
  assert.equal(request.options.cache, 'no-store')
  assert.equal(request.options.credentials, 'omit')
  const headers = new Headers(request.options.headers)
  assert.equal(headers.get('authorization'), null)
  assert.equal(headers.get('cookie'), null)
  assert.equal(data.goods.length, 2)
})

test('HTTP 错误直接失败，不回退旧数据源', async (t) => {
  let count = 0
  t.mock.method(globalThis, 'fetch', async () => { count++; return new Response('', { status: 503 }) })
  await assert.rejects(merchant.fetchCurrentGoods(now), /HTTP 503/)
  assert.equal(count, 1)
})

test('商品名称缺失时明确报错而不是产出空名', () => {
  const broken = '<li class="all_show li_show show_3 "><div class="gitem"><em>限购1</em></div></li>'
  assert.throws(() => merchant.parseItems(broken), /名称解析失败/)
})

test('文字兜底显示真实货币、限购和来源', () => {
  const app = new RocomMerchant()
  const data = merchant.parseMerchantSnapshot(sample(), now)
  const text = app.textFallback(data, { leftText: '1小时', nextText: '0分钟' })
  assert.match(text, /黑晶琉璃/)
  assert.match(text, /1000 洛克贝/)
  assert.match(text, /5 蜂窝/)
  assert.match(text, /onebiji\.com/)
})
