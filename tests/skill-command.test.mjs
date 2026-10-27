import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { register } from 'node:module'

const wiki = 'https://wiki.biligame.com'
const fetchedAt = '2026-10-23T01:00:00.000Z'
const html = fs.readFileSync(new URL('./fixtures/skill-sneeze.html', import.meta.url), 'utf8')
const strip = value => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const field = (block, name) => strip(block.match(new RegExp('<(div|span) class="nrc-skill-' + name + '">([\\s\\S]*?)</\\1>'))?.[2] || '')
const learners = { default: [], blood: [], stone: [] }
for (const block of html.split('<div class="nrc-skill-pet-card" data-skill-source="').slice(1)) {
  const source = block.slice(0, block.indexOf('"'))
  const link = block.match(/<a href="([^"]+)" title="([^"]+)">/)
  const name = field(block, 'pet-name')
  const formLabel = field(block, 'pet-subtitle')
  const typesBlock = block.match(/class="nrc-skill-pet-types">([\s\S]*?)<\/div>/)?.[1] || ''
  learners[source].push({
    name,
    formLabel,
    displayName: link[2],
    number: field(block, 'pet-number').replace(/^NO\./, ''),
    url: new URL(link[1], wiki).href,
    icon: block.match(/<img[^>]+src="([^"]+)"/)?.[1] || '',
    types: [...typesBlock.matchAll(/alt="([^"]+)系"/g)].map(match => match[1]),
    level: field(block, 'pet-level'),
    source
  })
}

const sneeze = {
  id: 'skill_000563', name: '打喷嚏', type: '冰', category: '状态', power: '—', energy: '1',
  description: field(html, 'effect-text'), season: '', tags: ['冻结'], icon: '',
  url: wiki + '/nrc/' + encodeURIComponent('打喷嚏')
}
const scratch = {
  id: 'scratch', name: '抓挠', type: '普通', category: '物理', power: '35', energy: '0',
  description: '造成伤害。', season: '', tags: ['测试标签'], icon: '',
  url: wiki + '/nrc/' + encodeURIComponent('抓挠')
}
const sneezeDetail = {
  ...sneeze,
  relatedMechanics: [{ name: '冻结', url: wiki + '/nrc/' + encodeURIComponent('冻结') }],
  stoneSources: [{
    name: '睡铃雪影娃娃', formLabel: '', displayName: '睡铃雪影娃娃',
    url: learners.default[0].url, icon: learners.default[0].icon,
    condition: field(html, 'source-topic')
  }],
  learners, learningAvailable: true, fetchedAt, stale: false
}

const stateKey = '__rocomSkillCommandTest'
const state = {}
globalThis[stateKey] = state
const appURL = new URL('../apps/skill-dex.js', import.meta.url).href
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
  '../models/skill-dex.js': dataURL(prelude + [
    'export async function getSkillCatalog() {',
    '  state.calls.push(["catalog"]);',
    '  if (state.catalogError) throw state.catalogError;',
    '  return state.catalog;',
    '}',
    'export function searchSkills(keyword, skills) {',
    '  state.calls.push(["search", keyword, skills]);',
    '  return skills.filter(skill => [skill.name, skill.description, ...skill.tags].some(value => value.includes(keyword)));',
    '}',
    'export function findSkill(keyword, skills) {',
    '  state.calls.push(["find", keyword, skills]);',
    '  const exact = skills.filter(skill => skill.name === keyword);',
    '  const candidates = exact.length ? exact : skills.filter(skill => skill.name.includes(keyword));',
    '  return candidates.length === 1 ? { skill: candidates[0], candidates: [] } : { skill: null, candidates };',
    '}',
    'export async function getSkillDetail(skill) {',
    '  state.calls.push(["detail", skill]);',
    '  if (state.detailError) throw state.detailError;',
    '  if (state.emptyDetail) return null;',
    '  return state.details[skill.id] || { ...skill, relatedMechanics: [], stoneSources: [], learners: { default: [], blood: [], stone: [] }, learningAvailable: false, fetchedAt: state.catalog.fetchedAt, stale: false };',
    '}'
  ].join('\n')),
  '../render/skill-dex-renderer.js': dataURL(prelude + [
    'export async function renderSkillDex(detail) {',
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
const { RocomSkillDex } = pluginModule

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, {
    catalog: { skills: structuredClone([sneeze, scratch]), fetchedAt, stale: false },
    details: { [sneeze.id]: structuredClone(sneezeDetail) },
    allowGroup: true, calls: [], logs: [], groupChecks: [], images: null
  })
})
after(() => { delete globalThis[stateKey] })

async function dispatch(msg, event = {}) {
  const app = new RocomSkillDex()
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
  assert.ok(rule, '消息应命中技能入口：' + msg)
  const result = await app[rule.fnc](e)
  return { app, e, rule, replies, result, text: replies.filter(value => typeof value === 'string').join('') }
}
const calls = () => state.calls.map(call => call[0])
const sourceLabels = { default: '自学', blood: '血脉', stone: '技能石' }

function assertAllLearners(text, expected = Object.values(learners).flat()) {
  const rows = text.split('\n').filter(line => /^\d+\. /.test(line))
  assert.equal(rows.length, expected.length)
  for (const learner of expected) {
    assert.ok(rows.some(row => row.includes(learner.displayName) && row.includes('编号 ' + learner.number) && row.includes('学习来源：' + sourceLabels[learner.source])), learner.displayName)
    assert.ok(text.includes(learner.url), '必须保留形态链接：' + learner.displayName)
    if (learner.formLabel) assert.ok(text.includes(learner.formLabel))
  }
}

test('本地打喷嚏夹具确为 default1/blood0/stone17 与 8 个不同名称', () => {
  assert.deepEqual(Object.values(learners).map(group => group.length), [1, 0, 17])
  assert.equal(new Set(Object.values(learners).flat().map(learner => learner.name)).size, 8)
  assert.equal(learners.default[0].number, '440')
  assert.equal(learners.default[0].level, 'Lv.26')
  assert.equal(sneeze.description, '3连击，每次连击敌方获得1层冻结。')
  assert.equal(sneezeDetail.stoneSources[0].condition, '使用2次打喷嚏')
})

test('动态导出只有插件类，规则只有搜索和详情且搜索在前', () => {
  assert.deepEqual(Object.keys(pluginModule), ['RocomSkillDex'])
  const app = new RocomSkillDex()
  assert.equal(app.priority, 5000)
  assert.deepEqual(app.rule.map(rule => rule.fnc), ['search', 'detail'])
})

for (const prefix of ['#', '']) {
  test('搜索优先详情且支持前缀「' + prefix + '」', async () => {
    const result = await dispatch(prefix + '技能搜索 打喷嚏')
    assert.equal(result.rule.fnc, 'search')
    assert.deepEqual(calls(), ['catalog', 'search'])
    assert.strictEqual(state.calls[1][2], state.catalog.skills)
    assert.match(result.text, /^#技能 打喷嚏 — 冰\/状态 · 威力 — · 耗能 1$/m)
  })
  test('详情支持前缀「' + prefix + '」并先加载目录再找名称', async () => {
    const result = await dispatch(prefix + '技能 打喷嚏')
    assert.equal(result.rule.fnc, 'detail')
    assert.deepEqual(calls(), ['catalog', 'find', 'detail', 'render'])
    assert.strictEqual(state.calls[1][2], state.catalog.skills)
    assert.strictEqual(state.calls[2][1], state.catalog.skills[0])
    assert.match(result.text, /【打喷嚏】/)
  })
}

for (const msg of ['#技能', '技能   ', '#技能搜索', '技能搜索\t']) {
  test('空参数或用法入口不给网络请求：' + JSON.stringify(msg), async () => {
    const result = await dispatch(msg)
    assert.match(result.text, /【技能图鉴】/)
    assert.match(result.text, /#技能搜索/)
    assert.deepEqual(calls(), [])
    assert.equal(state.groupChecks.length, 1)
  })
}

for (const keyword of ['喷嚏', '3连击', '测试标签']) {
  test('名称、描述和标签搜索会把关键词及目录交给 searchSkills：' + keyword, async () => {
    const result = await dispatch('#技能搜索 ' + keyword)
    assert.deepEqual(calls(), ['catalog', 'search'])
    assert.equal(state.calls[1][1], keyword)
    assert.match(result.text, /找到 1 个技能/)
  })
}

test('搜索最多 30 条，保留总数、截断提示与抓挠的零耗能', async () => {
  state.catalog.skills = Array.from({ length: 35 }, (_, index) => ({ ...scratch, id: '' + index, name: '抓挠' + String(index + 1).padStart(2, '0') }))
  const result = await dispatch('#技能搜索 抓挠')
  const rows = result.text.split('\n').filter(line => line.startsWith('#技能 '))
  assert.equal(rows.length, 30)
  assert.match(result.text, /找到 35 个技能/)
  assert.match(result.text, /仅显示前 30 条，共 35 条/)
  assert.match(rows[0], /威力 35 · 耗能 0$/)
  assert.match(rows[29], /^#技能 抓挠30 /)
  assert.doesNotMatch(result.text, /#技能 抓挠31 /)
})

test('名称精确匹配优先于多个模糊候选', async () => {
  state.catalog.skills.push({ ...sneeze, id: 'strong', name: '打喷嚏加强' })
  const result = await dispatch('#技能 打喷嚏')
  assert.match(result.text, /【打喷嚏】/)
  assert.doesNotMatch(result.text, /请使用完整名称/)
  assert.equal(state.calls.find(call => call[0] === 'detail')[1].name, '打喷嚏')
})

test('唯一模糊名称可获取详情', async () => {
  const result = await dispatch('#技能 喷嚏')
  assert.match(result.text, /【打喷嚏】/)
  assert.deepEqual(calls(), ['catalog', 'find', 'detail', 'render'])
})

test('歧义只列候选，不擅自加载任何详情', async () => {
  state.catalog.skills.push({ ...sneeze, id: 'strong', name: '打喷嚏加强' })
  const result = await dispatch('#技能 喷嚏')
  assert.deepEqual(calls(), ['catalog', 'find'])
  assert.match(result.text, /匹配到 2 个技能，请使用完整名称/)
  assert.match(result.text, /^#技能 打喷嚏 —/m)
  assert.match(result.text, /^#技能 打喷嚏加强 —/m)
})

test('完整关键词不会被按空白切成首个参数', async () => {
  state.catalog.skills = [{ ...scratch, name: '组合 技能' }]
  const result = await dispatch('#技能  组合 技能  ')
  assert.equal(state.calls[1][1], '组合 技能')
  assert.match(result.text, /【组合 技能】/)
})

for (const msg of ['#技能 不存在', '#技能 冻结', '#技能搜索 不存在']) {
  test('未找到明确回复且不加载详情：' + msg, async () => {
    const result = await dispatch(msg)
    assert.match(result.text, /没有找到/)
    assert.ok(!calls().includes('detail'))
    assert.ok(!calls().includes('render'))
  })
}

for (const msg of ['#技能 打喷嚏', '#技能搜索 冻结', '技能 打喷嚏', '技能搜索 冻结', '#技能', '#技能搜索']) {
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
  const result = await dispatch('#技能', { isGroup: false })
  assert.match(result.text, /【技能图鉴】/)
})

test('renderer 图片数组逐张 await 回复，并且不改写 Detail/18 条学习记录', async () => {
  state.images = [{ type: 'image', file: 'page-1.png' }, { type: 'image', file: 'page-2.png' }, { type: 'image', file: 'page-3.png' }]
  const before = structuredClone(state.details[sneeze.id])
  const result = await dispatch('#技能 打喷嚏')
  assert.deepEqual(result.replies, state.images)
  for (const [index, image] of state.images.entries()) assert.strictEqual(result.replies[index], image)
  assert.deepEqual(state.calls.find(call => call[0] === 'render')[1], before)
  assert.deepEqual(state.details[sneeze.id], before)
})

test('null 渲染回退为真正换行分段文字，完整保留 18 条形态/来源/获取条件', async () => {
  const result = await dispatch('#技能 打喷嚏')
  assert.ok(result.replies.length > 1)
  assert.ok(result.replies.every(reply => typeof reply === 'string' && reply.length <= 1800))
  assert.equal(result.text, result.app.detailText(state.details[sneeze.id]))
  assert.ok(result.text.includes('\n'))
  assert.ok(!result.text.includes('\\n'))
  assert.match(result.text, /属性：冰 · 分类：状态\n威力：— · 耗能：1/)
  assert.match(result.text, /3连击，每次连击敌方获得1层冻结。/)
  assert.match(result.text, /睡铃雪影娃娃：使用2次打喷嚏/)
  assert.match(result.text, /自学（1 条形态记录）/)
  assert.match(result.text, /血脉（0 条形态记录）：\n无/)
  assert.match(result.text, /技能石（17 条形态记录）/)
  assert.doesNotMatch(result.text, /学习来源：(default|blood|stone)/)
  assert.match(result.text, /编号 440 · 冰\/草 · Lv\.26/)
  assert.ok(result.text.includes(sneeze.url))
  assert.ok(result.text.includes(sneezeDetail.relatedMechanics[0].url))
  assertAllLearners(result.text)
})

test('不同学习方式中的同一链接分别保留，不按 name 或 url 单独去重', async () => {
  const detail = state.details[sneeze.id]
  detail.learners.stone.push({ ...detail.learners.default[0], level: '技能石', source: 'stone' })
  const result = await dispatch('#技能 打喷嚏')
  assertAllLearners(result.text, Object.values(detail.learners).flat())
  assert.equal(result.text.split('\n').filter(line => /^\d+\. 睡铃雪影娃娃/.test(line)).length, 2)
})

test('缺少完整 displayName 时仍补上 formLabel', async () => {
  const detail = state.details[sneeze.id]
  const learner = detail.learners.stone.find(learner => learner.formLabel)
  learner.displayName = learner.name
  const result = await dispatch('#技能 打喷嚏')
  assert.ok(result.text.includes(learner.name + '（' + learner.formLabel + '）'))
})

test('长段落按长度切分而不丢字符、不拆代理对', async () => {
  const detail = state.details[sneeze.id]
  detail.description = '🌨'.repeat(2400)
  const result = await dispatch('#技能 打喷嚏')
  assert.ok(result.replies.length >= 4)
  assert.ok(result.replies.every(reply => reply.length <= 1800))
  assert.equal(result.text, result.app.detailText(detail))
  for (const reply of result.replies) {
    assert.doesNotMatch(reply, /^[\uDC00-\uDFFF]/)
    assert.doesNotMatch(reply, /[\uD800-\uDBFF]$/)
  }
  assertAllLearners(result.text)
})

for (const kind of ['throw', 'empty']) {
  test('渲染' + kind + '也完整文字兜底，不误报网络问题', async () => {
    if (kind === 'throw') state.renderError = new Error('puppeteer unavailable')
    else state.images = []
    const result = await dispatch('#技能 打喷嚏')
    assertAllLearners(result.text)
    assert.match(result.text, /完整文字详情/)
    assert.doesNotMatch(result.text, /网络不可用/)
    if (kind === 'throw') assert.match(state.logs[0][0], /渲染失败/)
  })
}

for (const msg of ['#技能搜索 冻结', '#技能搜索 不存在', '#技能 不存在', '#技能 喷嚏']) {
  test('目录 stale 时搜索/无结果/候选均告警：' + msg, async () => {
    state.catalog.stale = true
    state.catalog.skills.push({ ...sneeze, id: 'strong', name: '打喷嚏加强' })
    const result = await dispatch(msg)
    assert.match(result.text, /正在使用过期缓存/)
    assert.ok(result.text.includes(fetchedAt))
  })
}

for (const staleFrom of ['catalog', 'detail']) {
  test(staleFrom + ' stale 时图片前先发警告', async () => {
    if (staleFrom === 'catalog') state.catalog.stale = true
    else state.details[sneeze.id].stale = true
    state.images = [{ type: 'image', file: 'first.png' }, { type: 'image', file: 'last.png' }]
    const result = await dispatch('#技能 打喷嚏')
    assert.match(result.replies[0], /正在使用过期缓存/)
    assert.deepEqual(result.replies.slice(1), state.images)
  })
}

test('stale 文字兜底只警告一次且继续完整展示', async () => {
  state.details[sneeze.id].stale = true
  const result = await dispatch('#技能 打喷嚏')
  assert.equal(result.text.split('正在使用过期缓存').length - 1, 1)
  assertAllLearners(result.text)
})

for (const msg of ['#技能搜索 冻结', '#技能 打喷嚏']) {
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
    const result = await dispatch('#技能 打喷嚏')
    assert.deepEqual(calls(), ['catalog', 'find', 'detail'])
    assert.match(result.text, /「打喷嚏」详情暂时不可用/)
    assert.match(result.text, /网络不可用/)
    assert.match(result.text, /没有可用的详情缓存/)
    assert.equal(state.logs.length, 1)
  })
}

test('抓挠威力 35/耗能 0 与学习数据未知不能显示成无人可学', async () => {
  const result = await dispatch('#技能 抓挠')
  assert.match(result.text, /威力：35 · 耗能：0/)
  assert.match(result.text, /暂未提供学习数据（不表示没有可学习精灵）/)
  assert.match(result.text, /自学（学习数据未提供）：\n未提供数据/)
  assert.doesNotMatch(result.text, /0 条形态记录/)
})

test('帮助合入现有洛克帮助与 README，没有泛化技能筛选命令', () => {
  for (const path of ['../resources/help/help.md', '../README.md']) {
    const text = fs.readFileSync(new URL(path, import.meta.url), 'utf8')
    for (const command of ['#技能 <名称>', '#技能搜索 <关键词>', '#洛克帮助']) assert.ok(text.includes(command))
    assert.match(text, /技能石获取条件/)
    assert.match(text, /过期/)
    assert.doesNotMatch(text, /#技能(?:筛选|图鉴)/)
    assert.ok(text.includes('复制'))
  }
})
