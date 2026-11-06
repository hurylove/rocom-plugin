import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import template from 'art-template'

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-hatch-'))
after(() => fs.rmSync(temp, { recursive: true, force: true }))
const componentsURL = new URL('../components/index.js', import.meta.url).href
const rendererURL = new URL('../render/hatch-renderer.js', import.meta.url).href
const componentStub = 'export const dataDir = ' + JSON.stringify(temp) + ';' +
  'export const log = {i(){},w(){},e(){},d(){}};' +
  'export class BaseApp { constructor(options){Object.assign(this,options)} async checkGroup(e){return !e.blocked} args(e,pattern){return e.msg.replace(pattern, "").trim().split(/\\s+/).filter(Boolean)} }'
const rendererStub = 'export async function renderHatch(){return globalThis.__hatchTestImage || null}'
const loader = 'export async function load(url, context, nextLoad){' +
  'if(url===' + JSON.stringify(componentsURL) + ')return {format:"module",source:' + JSON.stringify(componentStub) + ',shortCircuit:true};' +
  'if(url===' + JSON.stringify(rendererURL) + ')return {format:"module",source:' + JSON.stringify(rendererStub) + ',shortCircuit:true};' +
  'return nextLoad(url,context);}'
register('data:text/javascript;base64,' + Buffer.from(loader).toString('base64'), { parentURL: import.meta.url })
const { parseEggInput, queryHatch, SOURCE_URL } = await import('../models/hatch.js')
const { RocomHatch } = await import('../apps/hatch.js')
const payload = (matched = sample()) => ({ ok: true, matched, matched_count: matched.length })
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
function sample() {
  return [
    { base_id: '3069', display_name: '锤头鹳', fit_score: 84.25, match_probability: 63.28, match_probability_text: '63.3%', pet_preview: { type_name: '翼元素精灵, 水元素精灵' } },
    { base_id: '3062', display_name: '小独角兽', fit_score: 67.12, match_probability: 36.72, match_probability_text: '36.7%', same_ride_label: '概率同乘', pet_preview: { type_name: '光元素精灵' } }
  ]
}
const event = (msg = '#孵蛋查询 0.56 20.504') => {
  const replies = []
  return { msg, replies, reply(value) { replies.push(value); return value } }
}

test('保持尺寸重量指令，支持单位、逗号和小数', () => {
  for (const input of ['0.56 20.504', '0.56m 20.504kg', '0.56m20.504kg', '0.56 米，20.504 千克', '0.56,20.504', ' .56 20.504公斤 ']) {
    assert.deepEqual(parseEggInput(input), { size: 0.56, weight: 20.504 }, input)
  }
  assert.deepEqual(parseEggInput('10 1000'), { size: 10, weight: 1000 })
})

test('拒绝负数、额外参数、错误单位和非有限数，不能静默变成其他查询', () => {
  for (const input of ['', null, '0.56', '-0.56 20.504', '0.56 -20.504', '0 20', '1 0', '11 20', '1 1001', '0.56 20.504 3', '0.56cm 20.504g', 'abc0.56 20.504', '0.56.20.504', '1e-3 20', 'NaN 20', 'Infinity 20']) {
    assert.equal(parseEggInput(input), null, String(input))
  }
})

test('只请求新接口，参数不舍入且不附加网站可选筛选', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const u = new URL(url)
    assert.equal(u.origin + u.pathname, 'https://rocom.vip/api/magic-egg-lookup')
    assert.deepEqual([...u.searchParams], [['height_m', '0.123456'], ['weight_kg', '7.654321']])
    assert.equal(options.headers.Accept, 'application/json')
    assert.equal(options.headers.Referer, SOURCE_URL)
    assert.ok(options.signal instanceof AbortSignal)
    return json(payload([]))
  })
  await queryHatch(0.123456, 7.654321)
})

test('直接调用时也拒绝非法数值且不联网', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('不应请求') })
  for (const [size, weight] of [[NaN, 1], [Infinity, 1], [-1, 1], [1, 0], [11, 2], [1, 1001], ['1', 2]]) {
    await assert.rejects(queryHatch(size, weight), /尺寸或重量无效/)
  }
  assert.equal(fetchMock.mock.callCount(), 0)
})

test('准确保留网站候选、概率文本与顺序，不拿 fit_score 冒充匹配概率', async (t) => {
  const rows = sample().reverse()
  rows[0].height_edge_hint = { label: '偏大', probability_text: '91.2%' }
  t.mock.method(globalThis, 'fetch', async () => json(payload(rows)))
  const result = await queryHatch(0.56, 20.504)
  assert.deepEqual(result.cards.map(c => [c.name, c.probText]), [['小独角兽', '36.7%'], ['锤头鹳', '63.3%']])
  assert.equal(result.cards[0].badge, '概率同乘')
  assert.equal(result.cards[0].edgeText, '偏大 91.2%')
  assert.equal(result.cards[0].typeName, '光元素精灵')
  assert.equal(result.sourceUrl, SOURCE_URL)
  assert.equal(result.total, 2)
  for (const card of result.cards) for (const field of ['number', 'sizeRange', 'weightRange', 'imageUrl']) assert.ok(!(field in card))
})

test('零概率、缺少图片和未知概率的候选不会丢失', async (t) => {
  const rows = [
    { display_name: '极低概率', match_probability: 0, match_probability_text: '0.0%' },
    { display_name: '数值概率', match_probability: 12.345, fit_score: 99 },
    { display_name: '兼容分数', fit_score: 80 },
    { display_name: '未知概率' }
  ]
  t.mock.method(globalThis, 'fetch', async () => json(payload(rows)))
  const result = await queryHatch(1, 1)
  assert.equal(result.total, 4)
  assert.deepEqual(result.cards.map(c => c.probText), ['0.0%', '12.3%', '80.0%', '--'])
  assert.ok(result.cards.every(c => c.image === ''))
})

test('候选为空是合法空结果', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(payload([])))
  const result = await queryHatch(1, 1)
  assert.deepEqual(result.cards, [])
  assert.equal(result.total, 0)
})

test('与网站一样最多展示40条，同时保留完整数量', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(payload(Array.from({ length: 41 }, (_, i) => ({ display_name: '候选' + i, match_probability: i })))))
  const result = await queryHatch(1, 1)
  assert.equal(result.total, 41)
  assert.equal(result.cards.length, 40)
  assert.equal(result.cards[39].name, '候选39')
  assert.match(new RocomHatch().textFallback(result), /共 41 个候选，显示前 40 个/)
})

test('HTTP错误、接口错误、坏JSON和字段变更不能伪装成无匹配', async (t) => {
  const bad = [
    () => json({}, 503),
    () => json({ ok: false, message: '服务维护' }),
    () => new Response('<html>维护</html>'),
    () => json({ ok: true }),
    () => json({ ok: true, matched: {} }),
    () => json(payload([{}])),
    () => json(payload([null]))
  ]
  for (const response of bad) {
    const mock = t.mock.method(globalThis, 'fetch', async () => response())
    await assert.rejects(queryHatch(1, 1))
    assert.equal(mock.mock.callCount(), 1)
    mock.mock.restore()
  }
})

test('网络超时正常上抛，不回退到旧数据源', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'TimeoutError') })
  await assert.rejects(queryHatch(1, 1), { name: 'TimeoutError' })
  assert.equal(mock.mock.callCount(), 1)
})

test('新站签名图片按资源缓存，缓存文件不带签名且不复用旧站文件名', async (t) => {
  let imageCalls = 0
  let apiCalls = 0
  const bytes = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/api/')) {
      apiCalls++
      const rows = sample()
      rows[0].pet_preview.body_url = 'https://rococdn.kekit.vip/webp/pets/body/cache-test.webp?sign=token' + apiCalls
      return json(payload(rows))
    }
    imageCalls++
    return new Response(bytes, { headers: { 'content-type': 'image/webp' } })
  })
  const first = await queryHatch(0.56, 20.504)
  const second = await queryHatch(0.56, 20.504)
  assert.equal(imageCalls, 1)
  assert.equal(first.cards[0].image, second.cards[0].image)
  assert.match(first.cards[0].image, /^file:.*\/rocom_[a-f0-9]+\.webp$/)
  assert.deepEqual(fs.readFileSync(fileURLToPath(first.cards[0].image)), bytes)
})

test('图片下载或类型校验失败仍返回正确候选', async (t) => {
  for (const kind of ['html', 'http', 'throw']) {
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      if (String(url).includes('/api/')) {
        const rows = sample()
        rows[0].pet_preview.body_url = 'https://rococdn.kekit.vip/webp/pets/body/fail-' + kind + '.webp'
        return json(payload(rows))
      }
      if (kind === 'throw') throw new Error('image failed')
      return new Response('not an image', { status: kind === 'http' ? 404 : 200, headers: { 'content-type': 'text/html' } })
    })
    const result = await queryHatch(0.56, 20.504)
    assert.equal(result.cards[0].image, '')
    assert.equal(result.cards[0].probText, '63.3%')
    mock.mock.restore()
  }
})

test('拒绝外站、内网、非HTTPS和文件图片地址', async (t) => {
  const rows = ['http://rocom.vip/a.webp', 'https://127.0.0.1/a.webp', 'https://example.com/a.webp', 'file:///tmp/a.webp', 'https://user:pass@rocom.vip/a.webp'].map((url, i) => ({ display_name: '候选' + i, pet_preview: { body_url: url } }))
  const mock = t.mock.method(globalThis, 'fetch', async () => json(payload(rows)))
  const result = await queryHatch(1, 1)
  assert.equal(mock.mock.callCount(), 1)
  assert.ok(result.cards.every(c => c.image === ''))
})

test('图片下载并发不超过4个且不打乱候选顺序', async (t) => {
  let active = 0
  let peak = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (String(url).includes('/api/')) return json(payload(Array.from({ length: 7 }, (_, i) => ({ display_name: '候选' + i, pet_preview: { avatar_url: 'https://rococdn.kekit.vip/webp/pets/head/concurrent-' + i + '.webp' } }))))
    active++
    peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    return new Response('image', { headers: { 'content-type': 'image/webp' } })
  })
  const result = await queryHatch(1, 1)
  assert.ok(peak <= 4 && peak > 1)
  assert.deepEqual(result.cards.map(c => c.name), Array.from({ length: 7 }, (_, i) => '候选' + i))
})

test('指令权限和用法校验不会触发查询', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('不应请求') })
  const app = new RocomHatch()
  const blocked = event()
  blocked.blocked = true
  assert.equal(await app.hatch(blocked), false)
  const invalid = event('#孵蛋查询 -0.56 20.504')
  await app.hatch(invalid)
  assert.match(invalid.replies[0], /用法/)
  assert.equal(mock.mock.callCount(), 0)
})

test('图片不可用时文字含新来源、正确概率与同乘提示，无旧尺寸区间', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(payload()))
  const e = event()
  await new RocomHatch().hatch(e)
  assert.equal(e.replies.length, 1)
  assert.match(e.replies[0], /锤头鹳 · 匹配概率 63.3%/)
  assert.match(e.replies[0], /小独角兽 · 匹配概率 36.7% · 概率同乘/)
  assert.ok(e.replies[0].includes(SOURCE_URL))
  assert.doesNotMatch(e.replies[0], /undefined|尺寸区间|典型|luokewangguofudan/)
})

test('指令区分无匹配与服务不可用', async (t) => {
  const app = new RocomHatch()
  const mock = t.mock.method(globalThis, 'fetch', async () => json(payload([])))
  const empty = event()
  await app.hatch(empty)
  assert.match(empty.replies[0], /未找到候选/)
  mock.mock.restore()
  t.mock.method(globalThis, 'fetch', async () => json({}, 502))
  const failed = event()
  await app.hatch(failed)
  assert.match(failed.replies[0], /暂时不可用/)
  assert.doesNotMatch(failed.replies[0], /未找到|没有命中/)
})

test('截图成功仍按原指令返回图片', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => json(payload()))
  globalThis.__hatchTestImage = 'base64://test-image'
  try {
    const e = event()
    await new RocomHatch().hatch(e)
    assert.deepEqual(e.replies, ['base64://test-image'])
  } finally {
    delete globalThis.__hatchTestImage
  }
})

test('真实模板展示概率与插件名，省略旧字段并转义上游文本', async (t) => {
  const rows = sample()
  rows[0].display_name = '<script>alert(1)</script>'
  t.mock.method(globalThis, 'fetch', async () => json(payload(rows)))
  const result = await queryHatch(0.56, 20.504)
  const source = fs.readFileSync(new URL('../resources/hatch.html', import.meta.url), 'utf8')
  const html = template.render(source, { result, renderScale: 1, fontUrl: '' })
  assert.match(html, /63\.3%/)
  assert.match(html, /概率同乘/)
  assert.match(html, /rocom-plugin/)
  assert.doesNotMatch(html, /<script>|undefined|sizeRange|weightRange|尺寸 <br>/)
  assert.doesNotMatch(html, /数据来源|rocom\.vip\/hatch-query|洛克工具箱/)
  assert.ok(result.sourceUrl.includes('rocom.vip/hatch-query'))
})
