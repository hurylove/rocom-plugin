import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { register } from 'node:module'

const wiki = 'https://wiki.biligame.com'
const fetchedAt = '2026-10-23T01:00:00.000Z'
const traitURL = name => wiki + '/nrc/' + encodeURIComponent(name)

const owners = [
  { name: '电光狸', formLabel: '', displayName: '电光狸', number: '012', icon: '', types: ['光', '草'], url: traitURL('电光狸') },
  { name: '荧光鹿', formLabel: '白昼形态', displayName: '荧光鹿（白昼形态）', number: '087', icon: '', types: ['光'], url: traitURL('荧光鹿') },
  { name: '草原狐', formLabel: '', displayName: '草原狐', number: '134', icon: '', types: ['草'], url: traitURL('草原狐') }
]

const charge = {
  id: 'skill_000101', name: '蓄电', type: '光', secondaryType: '草',
  description: '每回合恢复自身少量体力，光系技能伤害提高。', icon: '', url: traitURL('蓄电')
}
const glow = {
  id: 'skill_000102', name: '辉光', type: '光', secondaryType: '',
  description: '光系技能命中后降低对手命中。', icon: '', url: traitURL('辉光')
}
const chargeDetail = {
  ...charge, owners: structuredClone(owners), total: owners.length,
  fetchedAt, stale: false
}

const stateKey = '__rocomTraitCommandTest'
const state = {}
globalThis[stateKey] = state
const appURL = new URL('../apps/trait-dex.js', import.meta.url).href
const dataURL = source => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
const prelude = 'const state = globalThis.' + stateKey + ';\n'
const stubs = {
  '../components/index.js': dataURL(prelude + [
    'export class BaseApp {',
    '  constructor(options) { Object.assign(this, options) }',
    '  async checkGroup(e) { state.groupChecks.push(e.msg); return !e.isGroup || state.allowGroup }',
    '}',
    'export const log = { w: (...args) => state.logs.push(args) }'
  ].join('\n')),
  '../models/trait-dex.js': dataURL(prelude + [
    'export async function getTraitCatalog() {',
    '  state.calls.push(["catalog"]);',
    '  if (state.catalogError) throw state.catalogError;',
    '  return state.catalog;',
    '}',
    'export function searchTraits(keyword, traits) {',
    '  state.calls.push(["search", keyword, traits]);',
    '  return traits.filter(trait => [trait.name, trait.type, trait.secondaryType, trait.description].some(value => String(value || "").includes(keyword)));',
    '}',
    'export function findTrait(keyword, traits) {',
    '  state.calls.push(["find", keyword, traits]);',
    '  const exact = traits.filter(trait => trait.name === keyword);',
    '  const candidates = exact.length ? exact : traits.filter(trait => trait.name.includes(keyword));',
    '  return candidates.length === 1 ? { trait: candidates[0], candidates: [] } : { trait: null, candidates };',
    '}',
    'export async function getTraitDetail(trait) {',
    '  state.calls.push(["detail", trait]);',
    '  if (state.detailError) throw state.detailError;',
    '  if (state.emptyDetail) return null;',
    '  return state.details[trait.id] || { ...trait, owners: [], total: 0, fetchedAt: state.catalog.fetchedAt, stale: false };',
    '}',
    'export async function cachedTraitImage() { return "" }'
  ].join('\n')),
  '../render/trait-dex-renderer.js': dataURL(prelude + [
    'export async function renderTraitDex(detail) {',
    '  state.calls.push(["render", detail]);',
    '  if (state.renderError) throw state.renderError;',
    '  return state.images;',
    '}'
  ].join('\n'))
}
register(dataURL([
  'const parent = ' + JSON.stringify(appURL) + ';',
  'const stubs = ' + JSON.stringify(stubs) + ';',
  'export function resolve(specifier, context, nextResolve) {',
  '  if (context.parentURL === parent && stubs[specifier]) return { url: stubs[specifier], shortCircuit: true };',
  '  return nextResolve(specifier, context);',
  '}'
].join('\n')), import.meta.url)
const pluginModule = await import(appURL)
const { RocomTraitDex } = pluginModule

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, {
    catalog: { traits: structuredClone([charge, glow]), fetchedAt, stale: false },
    details: { [charge.id]: structuredClone(chargeDetail) },
    allowGroup: true, calls: [], logs: [], groupChecks: [], images: null
  })
})
after(() => { delete globalThis[stateKey] })

async function dispatch(msg, event = {}) {
  const app = new RocomTraitDex()
  const replies = []
  let replying = false
  const e = {
    msg, isGroup: true, group_id: 12345, ...event,
    async reply(value) {
      assert.equal(replying, false, '回复必须按顺序 await，不能并发或合并图片数组')
      replying = true
      await Promise.resolve()
      replies.push(value)
      replying = false
      return true
    }
  }
  const rule = app.rule.find(rule => new RegExp(rule.reg).test(msg))
  assert.ok(rule, '消息应命中特性入口：' + msg)
  const result = await app[rule.fnc](e)
  return { app, e, rule, replies, result, text: replies.filter(value => typeof value === 'string').join('') }
}
const calls = () => state.calls.map(call => call[0])

test('动态导出只有插件类，规则只有搜索和详情且搜索在前', () => {
  assert.deepEqual(Object.keys(pluginModule), ['RocomTraitDex'])
  const app = new RocomTraitDex()
  assert.equal(app.priority, 5000)
  assert.equal(app.name, 'trait-dex')
  assert.equal(app.dsc, '特性图鉴查询（效果/携带精灵）')
  assert.deepEqual(app.rule.map(rule => rule.fnc), ['search', 'detail'])
})

for (const prefix of ['#', '']) {
  test('搜索优先详情且支持前缀「' + prefix + '」', async () => {
    const result = await dispatch(prefix + '特性搜索 蓄电')
    assert.equal(result.rule.fnc, 'search')
    assert.deepEqual(calls(), ['catalog', 'search'])
    assert.strictEqual(state.calls[1][2], state.catalog.traits)
    assert.match(result.text, /^#特性 蓄电 — 光\/草$/m)
  })
  test('详情支持前缀「' + prefix + '」并先加载目录再找名称', async () => {
    const result = await dispatch(prefix + '特性 蓄电')
    assert.equal(result.rule.fnc, 'detail')
    assert.deepEqual(calls(), ['catalog', 'find', 'detail', 'render'])
    assert.strictEqual(state.calls[1][2], state.catalog.traits)
    assert.match(result.text, /【蓄电】/)
  })
}

for (const msg of ['#特性', '特性   ', '#特性搜索', '特性搜索\t']) {
  test('空参数或用法入口不给网络请求：' + JSON.stringify(msg), async () => {
    const result = await dispatch(msg)
    assert.match(result.text, /【特性图鉴】/)
    assert.match(result.text, /#特性搜索/)
    assert.deepEqual(calls(), [])
    assert.equal(state.groupChecks.length, 1)
  })
}

for (const [keyword, expected] of [['蓄电', 1], ['光', 2], ['每回合恢复', 1]]) {
  test('名称、系别和效果搜索会把关键词及目录交给 searchTraits：' + keyword, async () => {
    const result = await dispatch('#特性搜索 ' + keyword)
    assert.deepEqual(calls(), ['catalog', 'search'])
    assert.equal(state.calls[1][1], keyword)
    assert.match(result.text, new RegExp('找到 ' + expected + ' 个特性'))
  })
}

test('搜索最多 30 条，保留总数与截断提示', async () => {
  state.catalog.traits = Array.from({ length: 35 }, (_, index) => ({ ...glow, id: '' + index, name: '辉光' + String(index + 1).padStart(2, '0') }))
  const result = await dispatch('#特性搜索 辉光')
  const rows = result.text.split('\n').filter(line => line.startsWith('#特性 '))
  assert.equal(rows.length, 30)
  assert.match(result.text, /找到 35 个特性/)
  assert.match(result.text, /仅显示前 30 条，共 35 条/)
  assert.match(rows[0], /光$/)
})

test('名称精确匹配优先于多个模糊候选', async () => {
  state.catalog.traits.push({ ...charge, id: 'strong', name: '蓄电强化' })
  const result = await dispatch('#特性 蓄电')
  assert.match(result.text, /【蓄电】/)
  assert.doesNotMatch(result.text, /请使用完整名称/)
  assert.equal(state.calls.find(call => call[0] === 'detail')[1].name, '蓄电')
})

test('唯一模糊名称可获取详情', async () => {
  const result = await dispatch('#特性 蓄')
  assert.equal(state.calls[1][1], '蓄')
  assert.deepEqual(calls(), ['catalog', 'find', 'detail', 'render'])
  assert.match(result.text, /【蓄电】/)
})

test('歧义只列候选，不擅自加载任何详情', async () => {
  state.catalog.traits.push({ ...charge, id: 'strong', name: '蓄电强化' })
  const result = await dispatch('#特性 蓄')
  assert.deepEqual(calls(), ['catalog', 'find'])
  assert.match(result.text, /匹配到 2 个特性，请使用完整名称/)
  assert.match(result.text, /^#特性 蓄电 — 光\/草$/m)
  assert.match(result.text, /^#特性 蓄电强化 — 光\/草$/m)
})

test('完整关键词不会被按空白切成首个参数', async () => {
  state.catalog.traits = [{ ...glow, name: '辉 光' }]
  state.details = {}
  const result = await dispatch('#特性  辉 光  ')
  assert.equal(state.calls[1][1], '辉 光')
  assert.match(result.text, /【辉 光】/)
})

for (const msg of ['#特性 不存在', '#特性 冰冻', '#特性搜索 不存在']) {
  test('未找到明确回复且不加载详情：' + msg, async () => {
    const result = await dispatch(msg)
    assert.match(result.text, /没有找到/)
    assert.ok(!calls().includes('detail'))
    assert.ok(!calls().includes('render'))
  })
}

for (const msg of ['#特性 蓄电', '#特性搜索 光', '特性 蓄电', '特性搜索 光', '#特性', '#特性搜索']) {
  test('群拒绝时所有入口均静默返回 false：' + msg, async () => {
    state.allowGroup = false
    const result = await dispatch(msg)
    assert.equal(result.result, false)
    assert.deepEqual(result.replies, [])
    assert.deepEqual(calls(), [])
    assert.equal(state.groupChecks.length, 1)
  })
}

test('私聊不错误套用群拒绝', async () => {
  state.allowGroup = false
  const result = await dispatch('#特性', { isGroup: false })
  assert.match(result.text, /【特性图鉴】/)
})

test('renderer 图片数组逐张 await 回复，并且不改写详情数据', async () => {
  state.images = [{ type: 'image', file: 'page-1.png' }, { type: 'image', file: 'page-2.png' }]
  const before = structuredClone(state.details[charge.id])
  const result = await dispatch('#特性 蓄电')
  assert.deepEqual(result.replies, state.images)
  for (const [index, image] of state.images.entries()) assert.strictEqual(result.replies[index], image)
  assert.deepEqual(state.calls.find(call => call[0] === 'render')[1], before)
  assert.deepEqual(state.details[charge.id], before)
})

test('null 渲染回退为真正换行分段文字，含名称/效果/携带精灵与总数', async () => {
  const result = await dispatch('#特性 蓄电')
  assert.ok(result.replies.length >= 1)
  assert.ok(result.replies.every(reply => typeof reply === 'string' && reply.length <= 1800))
  assert.equal(result.text, result.app.detailText(state.details[charge.id]))
  assert.ok(result.text.includes('\n'))
  assert.ok(!result.text.includes('\\n'))
  assert.match(result.text, /【蓄电】/)
  assert.match(result.text, /系别：光\/草/)
  assert.match(result.text, /效果：每回合恢复自身少量体力/)
  assert.match(result.text, /携带精灵（共 3 个精灵形态，以详情页为准）：/)
  for (const owner of owners) {
    assert.ok(result.text.includes(owner.displayName), owner.displayName)
    assert.ok(result.text.includes('编号 ' + owner.number))
    assert.ok(result.text.includes(owner.url))
  }
  assert.match(result.text, /光系|光\/草/)
  assert.match(result.text, /完整文字详情/)
})

test('携带精灵为空时文字兜底不假报有精灵，也不出现 undefined', async () => {
  state.details[charge.id] = { ...charge, owners: [], total: 0, fetchedAt, stale: false }
  const result = await dispatch('#特性 蓄电')
  assert.match(result.text, /携带精灵（共 0 个精灵形态，以详情页为准）：\n暂无记录/)
  assert.ok(!result.text.includes('undefined'))
})

test('缺少完整 displayName 时仍补上 formLabel', async () => {
  const detail = state.details[charge.id]
  const owner = detail.owners[1]
  owner.displayName = owner.name
  const result = await dispatch('#特性 蓄电')
  assert.ok(result.text.includes(owner.name + '（' + owner.formLabel + '）'))
})

test('长效果按长度切分而不丢字符、不拆代理对', async () => {
  const detail = state.details[charge.id]
  detail.description = '⚡'.repeat(2400)
  const result = await dispatch('#特性 蓄电')
  assert.ok(result.replies.length >= 3)
  assert.ok(result.replies.every(reply => reply.length <= 1800))
  assert.equal(result.text, result.app.detailText(detail))
  for (const reply of result.replies) {
    assert.doesNotMatch(reply, /^[\uDC00-\uDFFF]/)
    assert.doesNotMatch(reply, /[\uD800-\uDBFF]$/)
  }
})

for (const kind of ['throw', 'empty']) {
  test('渲染' + kind + '也完整文字兜底，不误报网络问题', async () => {
    if (kind === 'throw') state.renderError = new Error('puppeteer unavailable')
    else state.images = []
    const result = await dispatch('#特性 蓄电')
    assert.match(result.text, /携带精灵（共 3 个精灵形态/)
    assert.match(result.text, /完整文字详情/)
    assert.doesNotMatch(result.text, /网络不可用/)
    if (kind === 'throw') assert.match(state.logs[0][0], /渲染失败/)
  })
}

for (const msg of ['#特性搜索 光', '#特性搜索 不存在', '#特性 不存在', '#特性 蓄电']) {
  test('目录 stale 时各入口均告警：' + msg, async () => {
    state.catalog.stale = true
    state.catalog.traits.push({ ...charge, id: 'strong', name: '蓄电强化' })
    const result = await dispatch(msg)
    assert.match(result.text, /正在使用过期缓存/)
    assert.ok(result.text.includes(fetchedAt))
  })
}

for (const staleFrom of ['catalog', 'detail']) {
  test(staleFrom + ' stale 时图片前先发警告', async () => {
    if (staleFrom === 'catalog') state.catalog.stale = true
    else state.details[charge.id].stale = true
    state.images = [{ type: 'image', file: 'first.png' }, { type: 'image', file: 'last.png' }]
    const result = await dispatch('#特性 蓄电')
    assert.match(result.replies[0], /正在使用过期缓存/)
    assert.deepEqual(result.replies.slice(1), state.images)
  })
}

for (const msg of ['#特性搜索 光', '#特性 蓄电']) {
  test('无目录缓存且网络错误清楚反馈：' + msg, async () => {
    state.catalogError = new Error('fetch failed')
    const result = await dispatch(msg)
    assert.deepEqual(calls(), ['catalog'])
    assert.match(result.text, /网络不可用/)
    assert.match(result.text, /没有可用的目录缓存/)
    assert.equal(state.logs.length, 1)
  })
}

for (const kind of ['throw', 'null']) {
  test('无详情缓存：' + kind + ' 清楚反馈且不误把目录当详情', async () => {
    if (kind === 'throw') state.detailError = new Error('fetch failed')
    else state.emptyDetail = true
    const result = await dispatch('#特性 蓄电')
    assert.deepEqual(calls(), ['catalog', 'find', 'detail'])
    assert.match(result.text, /「蓄电」详情暂时不可用/)
    assert.match(result.text, /网络不可用/)
    assert.match(result.text, /没有可用的详情缓存/)
    assert.equal(state.logs.length, 1)
  })
}

test('帮助文档与 README 已追加特性图鉴章节并署名数据来源', () => {
  for (const path of ['../resources/help/help.md', '../README.md']) {
    const text = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
    assert.ok(text.includes('#特性 <名称>'), path)
    assert.ok(text.includes('#特性搜索 <关键词>'), path)
    assert.match(text, /特性图鉴/)
    assert.match(text, /wiki\.biligame\.com/)
  }
  const help = fs.readFileSync(new URL('../resources/help/help.md', import.meta.url), 'utf8')
  assert.match(help, /^# 特性图鉴$/m)
  assert.match(help, /携带精灵/)
})
