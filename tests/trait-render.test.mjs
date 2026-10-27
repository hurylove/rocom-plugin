import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import template from 'art-template'
import { buildTraitPages, renderTraitDex } from '../render/trait-dex-renderer.js'

const wiki = 'https://wiki.biligame.com'
const owner = (name, extra = {}) => ({ name, displayName: name, formLabel: '', number: '012', icon: '', types: ['光'], url: wiki + '/nrc/' + encodeURIComponent(name), ...extra })
const detail = (extra = {}) => ({
  id: 'skill_000101', name: '蓄电', type: '光', secondaryType: '草',
  description: '每回合恢复自身少量体力，光系技能伤害提高。', icon: '',
  url: wiki + '/nrc/' + encodeURIComponent('蓄电'),
  owners: [
    owner('电光狸', { number: '012', types: ['光', '草'] }),
    owner('荧光鹿', { formLabel: '白昼形态', displayName: '荧光鹿（白昼形态）', number: '087', types: ['光'] }),
    owner('草原狐', { number: '134', types: ['草'] })
  ],
  total: 3, fetchedAt: '2026-10-24T00:00:00Z', stale: false, ...extra
})
const file = new URL('../resources/trait-dex.html', import.meta.url)
const compile = template.compile(fs.readFileSync(file, 'utf8'), { filename: file.pathname, cache: false })
const cacheImage = async () => ''

test('buildTraitPages 输出名称、主副系别、效果、携带精灵与总数', () => {
  const pages = buildTraitPages(detail())
  assert.equal(pages.length, 1)
  const [page] = pages
  assert.equal(page.name, '蓄电')
  assert.equal(page.type, '光')
  assert.equal(page.secondaryType, '草')
  assert.equal(page.types, '光/草')
  assert.equal(page.description, '每回合恢复自身少量体力，光系技能伤害提高。')
  assert.equal(page.total, 3)
  assert.equal(page.shown, 3)
  assert.equal(page.pageNumber, 1)
  assert.equal(page.pageCount, 1)
  assert.equal(page.firstPage, true)
  assert.deepEqual(page.owners.map(item => item.displayName), ['电光狸', '荧光鹿（白昼形态）', '草原狐'])
  assert.deepEqual(page.owners.map(item => item.number), ['012', '087', '134'])
  assert.deepEqual(page.owners.map(item => item.types), ['光/草', '光', '草'])
  assert.ok(page.fontUrl.startsWith('file://'))
  assert.ok(page.fontUrl.endsWith('AlimamaFangYuanTiVF.ttf'))
})

test('单系别不拼斜杠，缺失字段给出可读兜底而不是 undefined', () => {
  const [page] = buildTraitPages(detail({ secondaryType: '', description: '', owners: undefined, total: undefined }))
  assert.equal(page.types, '光')
  assert.equal(page.secondaryType, '')
  assert.equal(page.description, '效果暂未提供')
  assert.equal(page.total, 0)
  assert.deepEqual(page.owners, [])
  const html = compile(page)
  assert.ok(html.includes('该特性详情页暂未提供携带精灵记录'))
  assert.ok(!html.includes('undefined'))
  assert.ok(!html.includes('[object Object]'))
})

test('总数缺失时回退为携带精灵条数，不假报 0', () => {
  const [page] = buildTraitPages({ ...detail(), total: undefined })
  assert.equal(page.total, 3)
  assert.equal(page.shown, 3)
})

test('多页按 pageSize 切分，逐页保留总数与页码', () => {
  const owners = Array.from({ length: 7 }, (_, index) => owner('精灵' + index, { number: String(index).padStart(3, '0') }))
  const pages = buildTraitPages(detail({ owners, total: 7 }), 3)
  assert.equal(pages.length, 3)
  assert.deepEqual(pages.map(page => page.owners.length), [3, 3, 1])
  assert.deepEqual(pages.map(page => page.pageNumber), [1, 2, 3])
  assert.deepEqual(pages.map(page => page.pageCount), [3, 3, 3])
  assert.deepEqual(pages.map(page => page.shown), [3, 3, 1])
  assert.deepEqual(pages.map(page => page.firstPage), [true, false, false])
  for (const page of pages) assert.equal(page.total, 7)
  const names = pages.flatMap(page => page.owners.map(item => item.displayName))
  assert.deepEqual(names, owners.map(item => item.displayName))
})

test('非法分页大小被明确拒绝', () => {
  for (const size of [0, -1, 1.5, 61, NaN]) assert.throws(() => buildTraitPages(detail(), size), RangeError)
})

test('特性图片页脚只显示插件名与特性指令，不暴露数据来源', () => {
  const html = compile(buildTraitPages(detail({ url: wiki + '/nrc/%E8%93%84%E7%94%B5' }))[0])
  assert.ok(html.includes('rocom-plugin'), '页脚应显示插件名')
  assert.ok(html.includes('#特性 名称'), '页脚应提示特性指令')
  assert.ok(html.includes('#特性搜索'), '页脚应提示特性搜索')
  assert.ok(!html.includes('#技能'), '特性图片不得出现技能指令')
  assert.ok(!html.includes('#精灵'), '特性图片不得出现精灵指令')
  assert.ok(!/wiki\.biligame|%E8%93%84%E7%94%B5|Wiki/i.test(html), '特性图片不得出现数据来源或网址')
})

test('特性图片渲染主副系别标签、效果全文与全部携带精灵', () => {
  const html = compile(buildTraitPages(detail())[0])
  for (const value of ['蓄电', '光系', '草系', '每回合恢复自身少量体力', '电光狸', '荧光鹿（白昼形态）', '草原狐', 'NO.012', '光/草']) assert.ok(html.includes(value), value)
  assert.equal((html.match(/class="owner"/g) || []).length, 3)
  assert.ok(!html.includes('第 1 / 1 页'), '单页不应显示页码')
  assert.ok(html.includes('共 3 个精灵形态'))
})

test('模板转义特性名、效果与精灵名，不注入网页标记', () => {
  const injection = '<script>alert(1)</script>'
  const [page] = buildTraitPages(detail({
    name: injection, description: injection,
    owners: [owner(injection, { displayName: injection, formLabel: '' })]
  }))
  const html = compile(page)
  assert.ok(!html.includes(injection))
  assert.match(html, /(?:&lt;|&#60;)script(?:&gt;|&#62;)/)
  assert.ok(!html.includes('undefined'))
})

test('缓存过期提示与数据时间可见，且仍不出现来源网址', () => {
  const html = compile(buildTraitPages(detail({ stale: true }))[0])
  assert.ok(html.includes('当前使用已有缓存'))
  assert.ok(html.includes('2026/10/24'))
  assert.ok(!/wiki\.biligame|Wiki/i.test(html))
})

test('renderer 逐页渲染并保留渲染参数', async () => {
  const payloads = []
  const owners = Array.from({ length: 5 }, (_, index) => owner('精灵' + index))
  const out = await renderTraitDex(detail({ owners, total: 5 }), {
    cacheImage, renderScale: 2, pageSize: 2,
    screenshot: async (key, payload) => { assert.equal(key, 'rocom_trait_dex'); payloads.push(payload); return 'image' + payload.pageNumber }
  })
  assert.deepEqual(out, ['image1', 'image2', 'image3'])
  assert.equal(payloads.length, 3)
  assert.equal(payloads[0].renderScale, 2)
  assert.ok(payloads[0].tplFile.endsWith('trait-dex.html'))
  assert.equal(payloads[0].imgType, 'png')
  assert.deepEqual(payloads.map(payload => payload.owners.length), [2, 2, 1])
})

test('并发查询不会复用截图输出路径', async () => {
  const ids = []
  const options = { cacheImage, screenshot: async (_, payload) => { ids.push(payload.saveId); return payload.saveId } }
  await Promise.all([renderTraitDex(detail(), options), renderTraitDex(detail(), options)])
  assert.equal(new Set(ids).size, 2)
})

test('头像缓存按 URL 去重并限并发，失败 URL 使用占位', async () => {
  let active = 0, maxActive = 0, calls = 0, payload
  const owners = Array.from({ length: 12 }, (_, index) => owner('P' + index, { icon: 'https://patchwiki.biligame.com/' + index + '.png' }))
  const out = await renderTraitDex(detail({ icon: 'https://patchwiki.biligame.com/repeat.png', owners, total: 12 }), {
    cacheImage: async url => {
      calls++; active++; maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setImmediate(resolve)); active--
      if (url.endsWith('/0.png')) throw new Error('image unavailable')
      return 'file:///tmp/cache.png'
    },
    screenshot: async (_, value) => { payload = value; return 'image' }
  })
  assert.deepEqual(out, ['image'])
  assert.equal(calls, 13)
  assert.ok(maxActive <= 6)
  assert.equal(payload.icon, 'file:///tmp/cache.png')
  assert.equal(payload.owners[0].icon, '')
  assert.equal(payload.owners[1].icon, 'file:///tmp/cache.png')
})

test('缓存函数返回外站 URL 时不让渲染器现场访问外站', async () => {
  let payload
  await renderTraitDex(detail({ icon: 'https://patchwiki.biligame.com/x.png' }), {
    cacheImage: async () => 'https://evil.invalid/x.png',
    screenshot: async (_, value) => { payload = value; return 'image' }
  })
  assert.equal(payload.icon, '')
})

test('任一页渲染失败返回 null，不把不完整图片当成功', async () => {
  const errors = []
  const owners = Array.from({ length: 4 }, (_, index) => owner('精灵' + index))
  const out = await renderTraitDex(detail({ owners, total: 4 }), {
    cacheImage, pageSize: 2, logger: { error: (...args) => errors.push(args) },
    screenshot: async (_, payload) => payload.pageNumber === 1 ? 'first' : false
  })
  assert.equal(out, null)
  assert.equal(errors.length, 1)
})
