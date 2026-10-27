import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import template from 'art-template'
import { buildSkillPages, renderSkillDex } from '../render/skill-dex-renderer.js'

const learner = (name, extra = {}) => ({ name, number: '235', icon: '', types: ['冰'], level: '', ...extra })
const detail = (extra = {}) => ({
  id: 'sneeze', name: '打喷嚏', type: '冰', category: '状态', power: '—', energy: '1',
  description: '3连击，每次连击敌方获得1层冻结。', season: 'S1', tags: ['冻结'], icon: '',
  relatedMechanics: [{ name: '冻结', url: 'https://wiki.biligame.com/nrc/冻结' }],
  stoneSources: [{ name: '睡铃雪影娃娃', condition: '使用2次打喷嚏', icon: '' }],
  learners: { default: [learner('睡铃雪影娃娃', { number: '440', level: '26' })], blood: [], stone: [
    ...['杨桃饰品', '樱桃饰品', '蓝莓饰品'].map(formLabel => learner('香草甜甜', { formLabel })),
    ...Array.from({ length: 14 }, (_, i) => learner('技能石样本' + i))
  ] }, learningAvailable: true, stale: false, fetchedAt: '2026-10-24T00:00:00Z',
  url: 'https://wiki.biligame.com/nrc/打喷嚏', ...extra
})
const file = new URL('../resources/skill-dex.html', import.meta.url)
const compile = template.compile(fs.readFileSync(file, 'utf8'), { filename: file.pathname, cache: false })
const cacheImage = async () => ''

test('技能图片保留状态技能威力、耗能、石头条件与具体形态', () => {
  const [page] = buildSkillPages(detail())
  assert.equal(page.power, '—')
  assert.equal(page.energy, '1')
  assert.equal(page.total, 18)
  assert.deepEqual(page.counts, { default: 1, blood: 0, stone: 17 })
  assert.equal(page.groups[0].items[0].level, 'Lv.26')
  assert.equal(page.groups[2].items[0].displayName, '香草甜甜（杨桃饰品）')
  const html = compile(page)
  for (const value of ['使用2次打喷嚏', '睡铃雪影娃娃', '香草甜甜（樱桃饰品）', '第 1 / 1 页', '暂无通过该方式学习的精灵']) assert.ok(html.includes(value), value)
  assert.equal((html.match(/class="pet"/g) || []).length, 18)
})

test('威力耗能数字0与字符串0都不会显示为未知', () => {
  const [page] = buildSkillPages(detail({ power: 0, energy: '0' }))
  assert.equal(page.power, '0'); assert.equal(page.energy, '0')
  assert.equal((compile(page).match(/<strong>0<\/strong>/g) || []).length, 2)
})

test('125条按方式跨页且无遗漏重复，形态顺序保持', () => {
  const learners = { default: Array.from({ length: 26 }, (_, i) => learner('自学' + i)), blood: Array.from({ length: 3 }, (_, i) => learner('血脉' + i)), stone: Array.from({ length: 96 }, (_, i) => learner('石头' + i)) }
  const pages = buildSkillPages(detail({ learners }))
  assert.equal(pages.length, 6)
  assert.deepEqual(pages.map(p => p.shown), [24, 24, 24, 24, 24, 5])
  const names = pages.flatMap(p => p.groups.flatMap(g => g.items.map(x => x.displayName)))
  assert.equal(names.length, 125); assert.equal(new Set(names).size, 125)
  assert.deepEqual(names, Object.values(learners).flat().map(p => p.name))
  pages.forEach((p, i) => { assert.equal(p.pageNumber, i + 1); assert.equal(p.pageCount, 6); assert.equal(p.total, 125) })
  const html = pages.map(compile).join('\n')
  assert.equal((html.match(/class="pet"/g) || []).length, 125)
  assert.equal((html.match(/<h2>技能石获取<\/h2>/g) || []).length, 1)
})

test('未知学习资料不假报0，自学等真空组可明确显示暂无', () => {
  const unknown = compile(buildSkillPages({})[0])
  assert.ok(unknown.includes('学习资料暂不可用'))
  assert.ok(!unknown.includes('暂无通过该方式'))
  const empty = compile(buildSkillPages(detail({ learners: { default: [], blood: [], stone: [] }, stoneSources: [] }))[0])
  assert.equal((empty.match(/暂无通过该方式/g) || []).length, 3)
  assert.ok(empty.includes('页面暂未提供技能石获取条件'))
})

test('模板转义技能说明、获取条件与精灵名，不注入网页标记', () => {
  const injection = '<script>alert(1)</script>'
  const [page] = buildSkillPages(detail({ name: injection, description: injection, stoneSources: [{ name: injection, condition: injection }], learners: { default: [learner(injection)], blood: [], stone: [] } }))
  const html = compile(page)
  assert.ok(!html.includes(injection)); assert.match(html, /(?:&lt;|&#60;)script(?:&gt;|&#62;)/)
  assert.ok(!html.includes('undefined')); assert.ok(!html.includes('[object Object]'))
})

test('缓存过期提示与来源数据时间都可见', () => {
  const html = compile(buildSkillPages(detail({ stale: true }))[0])
  assert.ok(html.includes('当前使用已有缓存'))
  assert.ok(html.includes('https://wiki.biligame.com/nrc/打喷嚏'))
  assert.ok(html.includes('2026/10/24'))
})

test('非法分页大小被明确拒绝', () => {
  for (const size of [0, -1, 1.5, 61, NaN]) assert.throws(() => buildSkillPages(detail(), size), RangeError)
})

test('renderer逐页使用隔离的saveId、保持顺序并返回图片数组', async () => {
  const payloads = []
  const input = detail({ learners: { default: [], blood: [], stone: Array.from({ length: 50 }, (_, i) => learner('精灵' + i)) } })
  const out = await renderSkillDex(input, { cacheImage, renderScale: 2, screenshot: async (key, payload) => { assert.equal(key, 'rocom_skill_dex'); payloads.push(payload); return 'image' + payload.pageNumber } })
  assert.deepEqual(out, ['image1', 'image2', 'image3'])
  assert.equal(new Set(payloads.map(p => p.saveId)).size, 3)
  assert.equal(payloads[0].renderScale, 2)
  assert.ok(payloads.every(p => p.tplFile.endsWith('skill-dex.html')))
  assert.ok(payloads.every(p => p.imgType === 'png'))
})

test('并发查询不会复用截图输出路径', async () => {
  const ids = []
  const options = { cacheImage, screenshot: async (_, p) => { ids.push(p.saveId); return p.saveId } }
  await Promise.all([renderSkillDex(detail(), options), renderSkillDex(detail(), options)])
  assert.equal(new Set(ids).size, 2)
})

test('图像缓存按URL去重并限并发，失败URL使用占位', async () => {
  let active = 0, maxActive = 0, calls = 0, payload
  const input = detail({ icon: 'https://patchwiki.biligame.com/repeat.png', stoneSources: [{ name: '来源', icon: 'https://patchwiki.biligame.com/repeat.png' }], learners: { default: Array.from({ length: 12 }, (_, i) => learner('P' + i, { icon: 'https://patchwiki.biligame.com/' + i + '.png' })), blood: [], stone: [] } })
  const out = await renderSkillDex(input, { cacheImage: async url => {
    calls++; active++; maxActive = Math.max(maxActive, active)
    await new Promise(resolve => setImmediate(resolve)); active--
    if (url.endsWith('/0.png')) throw new Error('image unavailable')
    return 'file:///tmp/cache.png'
  }, screenshot: async (_, p) => { payload = p; return 'image' } })
  assert.deepEqual(out, ['image']); assert.equal(calls, 13); assert.ok(maxActive <= 6)
  assert.equal(payload.icon, 'file:///tmp/cache.png')
  assert.equal(payload.groups[0].items[0].icon, '')
})

test('缓存函数返回外站URL时不让渲染器现场访问外站', async () => {
  let payload
  await renderSkillDex(detail({ icon: 'https://patchwiki.biligame.com/x.png' }), { cacheImage: async () => 'https://evil.invalid/x.png', screenshot: async (_, p) => { payload = p; return 'image' } })
  assert.equal(payload.icon, '')
})

test('任一页渲染失败返回null，不把不完整图片当成功', async () => {
  const errors = []
  const out = await renderSkillDex(detail(), { pageSize: 10, cacheImage, screenshot: async (_, p) => p.pageNumber === 1 ? 'first' : false, logger: { error: (...args) => errors.push(args) } })
  assert.equal(out, null); assert.equal(errors.length, 1)
})
