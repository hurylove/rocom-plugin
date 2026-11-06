import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { register } from 'node:module'
import { getSeasonData } from '../models/season-shiny.js'
import { parsePetDetail, displayName, findPet, findPetByNumber, searchPets } from '../models/pet-dex.js'

const dimo = fs.readFileSync(new URL('./fixtures/pet-dimo.html', import.meta.url), 'utf-8')

test('parsePetDetail 解析真实详情页：种族值/药丸/技能/进化', () => {
  const detail = parsePetDetail(dimo, { pet: { number: '001', name: '迪莫', types: ['光'], formLabel: '', season: 'none' } })
  assert.deepEqual(detail.stats.map((s) => s.name + '=' + s.value), ['生命=120', '攻击=80', '魔攻=80', '物防=105', '魔防=105', '速度=92'])
  const pillMap = Object.fromEntries(detail.pills.map((p) => [p.key, p.value]))
  assert.ok(pillMap['体重'].includes('kg'))
  assert.ok(pillMap['身高'].includes('m'))
  assert.ok(pillMap['星光值'])
  assert.ok(pillMap['洛克贝'])
  assert.ok(detail.skills.length >= 50, 'skills=' + detail.skills.length)
  const first = detail.skills[0]
  assert.ok(first.name && first.type && first.cat, JSON.stringify(first).slice(0, 200))
  assert.ok(detail.branches.length >= 3, 'branches=' + detail.branches.length)
  const b1 = detail.branches[0]
  assert.equal(b1.nodes.length, 2)
  assert.equal(b1.nodes[0].name, '迪莫')
  assert.equal(b1.nodes[1].name, '圣光迪莫')
  assert.ok(b1.nodes.some((n) => n.current), 'current node missing')
  assert.ok(b1.conns.length >= 1 && b1.conns[0].includes('首领化'), JSON.stringify(b1.conns))
  assert.ok(detail.skills.every((s) => s.desc), 'desc missing')
  assert.equal(detail.identity.name, '迪莫')
})

test('parsePetDetail 对空/异常输入安全降级', () => {
  const empty = parsePetDetail('', null)
  assert.deepEqual(empty.stats, [])
  assert.deepEqual(empty.pills, [])
  assert.deepEqual(empty.skills, [])
  assert.deepEqual(empty.branches, [])
})

test('索引数据完整：662 个形态，字段齐全', () => {
  const pets = JSON.parse(fs.readFileSync(new URL('../models/pet-dex-data.json', import.meta.url), 'utf-8'))
  assert.equal(pets.length, 662)
  assert.ok(pets.every((p) => p.number && p.name && p.page && p.artNormal))
  assert.ok(pets.every((p) => Array.isArray(p.types) && p.types.length >= 1))
  const shiny = pets.filter((p) => p.shiny)
  assert.equal(shiny.length, 240)
  assert.ok(shiny.every((p) => p.artShiny))
  assert.equal(new Set(pets.map((p) => p.number)).size, 493)
  assert.equal(new Set(pets.map((p) => p.id)).size, pets.length)
  assert.equal(new Set(pets.map((p) => p.page)).size, pets.length)
  assert.ok(pets.every((p) => /^pet_\d+$/.test(p.id) && /^\d{3}$/.test(p.number) && p.name !== '???'))
})

test('apps/pet-dex.js 规则集完整，且能匹配真实指令', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  assert.ok(source.includes('extends BaseApp'))
  const fncs = [...source.matchAll(/fnc: '([^']+)'/g)].map((m) => m[1])
  assert.deepEqual(fncs, ['search', 'byNumber', 'usage', 'detail'])
  // 按 JS 字符串规则还原文件里的正则字面量，再用真实指令验证路由
  const rules = [...source.matchAll(/reg: '([^']+)', fnc: '([^']+)'/g)].map((m) => ({
    re: new RegExp(JSON.parse('"' + m[1] + '"')),
    fnc: m[2]
  }))
  assert.equal(rules.length, 4)
  const dispatch = (msg) => (rules.find((r) => r.re.test(msg)) || {}).fnc
  assert.equal(dispatch('#精灵搜索 雪绒鸟'), 'search')
  assert.equal(dispatch('#精灵编号 018'), 'byNumber')
  // usage 规则是 ^#?精灵图鉴?$ —— 「鉴」可选，所以 #精灵图 同样进用法说明
  assert.equal(dispatch('#精灵图鉴'), 'usage')
  assert.equal(dispatch('#精灵图'), 'usage')
  // 只带空白参数时进详情处理，由 detail() 回退到用法说明
  assert.equal(dispatch('#精灵 '), 'detail')
  assert.equal(dispatch('#精灵 迪莫'), 'detail')
  assert.equal(dispatch('#精灵 雪绒鸟（春天的样子）'), 'detail')
  // 精灵异色 已删除，不再有专属处理函数
  assert.equal(dispatch('#精灵异色 迪莫'), 'detail')
})

test('#精灵异色 已移除，形态由全名区分', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  assert.ok(!source.includes('精灵异色'), 'command still present')
  assert.ok(!source.includes('shinyFirst'), 'shinyFirst still present')
  assert.ok(source.includes('displayName'), 'app must show form in names')
})

test('同名多形态：全名可精确定位，简称返回候选', () => {
  // 雪绒鸟：4 个形态，编号同为 018
  const byName = findPet('雪绒鸟')
  assert.ok(byName.candidates, 'bare name should be ambiguous')
  assert.equal(byName.total, 4)
  assert.deepEqual(byName.candidates.map((p) => displayName(p)), [
    '雪绒鸟（春天的样子）',
    '雪绒鸟（夏天的样子）',
    '雪绒鸟（秋天的样子）',
    '雪绒鸟（本来的样子）'
  ])
  // 全名精确命中
  const spring = findPet('雪绒鸟（春天的样子）')
  assert.ok(spring && spring.id, 'full name must resolve')
  assert.equal(spring.formLabel, '春天的样子')
  assert.equal(spring.page, '/nrc/%E9%9B%AA%E7%BB%92%E9%B8%9F%EF%BC%88%E6%98%A5%E5%A4%A9%E7%9A%84%E6%A0%B7%E5%AD%90%EF%BC%89')
  // 去标点/省略括号的口语写法
  assert.equal(findPet('雪绒鸟春天').id, spring.id, 'compact form')
  assert.equal(findPet('雪绒鸟(春天的样子)').id, spring.id, 'half-width parens')
  assert.equal(findPet('雪绒鸟 本来的样子').id, findPet('雪绒鸟（本来的样子）').id)
  // 单形态精灵仍按名称直达
  assert.equal(displayName(findPet('迪莫')), '迪莫')
  // 无命中返回 null，而不是空候选（避免误报「对应多只精灵」）
  assert.equal(findPet('不存在的精灵xyz'), null)
  assert.equal(findPet(''), null)
})

test('搜索结果与索引整体：展示名全局唯一，同名组靠形态区分', () => {
  const pets = JSON.parse(fs.readFileSync(new URL('../models/pet-dex-data.json', import.meta.url), 'utf-8'))
  const names = pets.map(displayName)
  assert.equal(new Set(names).size, names.length, 'displayName must be unique across the index')
  // 每个同名组都能靠形态标签区分开
  const byName = new Map()
  for (const p of pets) {
    if (!byName.has(p.name)) byName.set(p.name, [])
    byName.get(p.name).push(p)
  }
  const dups = [...byName.values()].filter((group) => group.length > 1)
  assert.ok(dups.length >= 71, 'expected many multi-form groups, got ' + dups.length)
  for (const group of dups) {
    assert.ok(group.every((p) => p.formLabel), 'multi-form entry missing formLabel: ' + group[0].name)
    assert.equal(new Set(group.map(displayName)).size, group.length, 'forms not distinguishable: ' + group[0].name)
  }
  // 搜索结果携带形态，用户能分辨同名条目
  const hits = searchPets('雪绒鸟')
  assert.equal(hits.length, 4)
  assert.ok(hits.every((p) => p.formLabel))
  // 同级按编号、再按形态名（中文拼音）排序
  assert.deepEqual(hits.map(displayName), ['雪绒鸟（本来的样子）', '雪绒鸟（春天的样子）', '雪绒鸟（秋天的样子）', '雪绒鸟（夏天的样子）'])
  // 编号定位同样返回全部形态
  const byNum = findPetByNumber('018')
  assert.equal(byNum.total, 4)
  assert.ok(byNum.candidates.every((p) => p.name === '雪绒鸟'))
})

test('this.args 前缀正则能剥掉指令前缀（防双反斜杠转义回归）', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  const literals = [...source.matchAll(/this\.args\(e,\s*(\/[^\/]+\/[gimsuy]*)\)/g)].map((m) => m[1])
  assert.equal(literals.length, 3, 'expected three args() prefix regexes')
  const regs = literals.map((lit) => new Function('return ' + lit)())
  // 与 components/base-app.js 的 args() 实现保持一致：剥前缀 → trim → 按空白切分
  const argsImpl = (msg, prefixRe) => String(msg).replace(prefixRe, '').trim().split(/\s+/).filter(Boolean)
  const [searchRe, numberRe, detailRe] = regs
  assert.deepEqual(argsImpl('#精灵搜索 雪绒鸟', searchRe), ['雪绒鸟'])
  assert.deepEqual(argsImpl('#精灵编号 018', numberRe), ['018'])
  assert.deepEqual(argsImpl('#精灵 雪绒鸟', detailRe), ['雪绒鸟'])
  assert.deepEqual(argsImpl('#精灵 雪绒鸟（春天的样子）', detailRe), ['雪绒鸟（春天的样子）'])
  // 回归点：正则字面量里写成 \\s 时 \s 变成「反斜杠+s」，前缀剥不掉，关键词退化成 "#精灵"
  for (const lit of literals) assert.ok(!lit.includes('\\\\'), 'double-escaped metachar in ' + lit)
  // 端到端：提取出的关键词必须能在索引里定位到精灵
  const keyword = argsImpl('#精灵 雪绒鸟（春天的样子）', detailRe)[0]
  const found = findPet(keyword)
  assert.ok(found && found.id, 'keyword ' + keyword + ' must resolve')
  assert.equal(found.formLabel, '春天的样子')
})

test('回复拼接不含字面反斜杠 n（换行必须是真实换行）', () => {
  const BS = String.fromCharCode(92)
  const NL = String.fromCharCode(10)
  const bad = "join('" + BS + BS + "n')"
  const good = "join('" + BS + "n')"
  const appDir = new URL('../apps/', import.meta.url)
  let checked = 0
  for (const f of fs.readdirSync(appDir)) {
    if (!f.endsWith('.js')) continue
    const text = fs.readFileSync(new URL(f, appDir), 'utf-8')
    assert.ok(!text.includes(bad), f + ' 存在字面反斜杠 n 拼接，回复会原样显示')
    checked++
  }
  assert.ok(checked >= 8, '应扫描全部 app，实际 ' + checked)
  const pet = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  assert.equal(pet.split(good).length - 1, 4, 'pet-dex.js 应有 4 处真实换行拼接')
  const text = ['雪绒鸟 有 4 个形态，请指定其中一个：', '#精灵 雪绒鸟（春天的样子）', '#精灵 雪绒鸟（本来的样子）'].join(NL)
  assert.equal(text.split(NL).length, 3, '拼接结果必须是多行')
  assert.ok(!text.includes(BS), '拼接结果不应含反斜杠')
})

test('候选列表每行都是可直接复制的完整指令', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  const start = source.indexOf('pickCandidate(e, found)')
  const end = source.indexOf('async renderDetail(', start)
  assert.ok(start > 0 && end > start, 'pickCandidate not found')
  const body = source.slice(start, end)
  const BT = String.fromCharCode(96)
  const marker = 'candidates.map((p) => ' + BT
  const i = body.indexOf(marker)
  assert.ok(i >= 0, '候选行模板未找到')
  const tpl = body.slice(i + marker.length, body.indexOf(BT, i + marker.length))
  assert.ok(tpl.startsWith('#精灵 '), '每行必须以 #精灵 开头，实际: ' + JSON.stringify(tpl))
  assert.ok(!tpl.includes('·'), '不应带项目符号，方便直接复制: ' + JSON.stringify(tpl))
  assert.ok(tpl.includes('displayName(p)'), '应使用含形态的展示名: ' + JSON.stringify(tpl))
})

test('搜索结果每行也是可直接复制的完整指令', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  const start = source.indexOf('async search(e)')
  const end = source.indexOf('async byNumber(', start)
  const body = source.slice(start, end)
  const BT = String.fromCharCode(96)
  const marker = 'pets.map((p) => ' + BT
  const i = body.indexOf(marker)
  assert.ok(i >= 0, '搜索行模板未找到')
  const tpl = body.slice(i + marker.length, body.indexOf(BT, i + marker.length))
  assert.ok(tpl.startsWith('#精灵 '), '搜索行必须以 #精灵 开头，实际: ' + JSON.stringify(tpl))
  assert.ok(!tpl.includes('·'), '搜索行不应带项目符号: ' + JSON.stringify(tpl))
  assert.ok(tpl.includes('displayName(p)'), '应使用含形态的展示名: ' + JSON.stringify(tpl))
})

// Wiki 西瓜虫 2026-11-06：删去图片后的种族值/基础信息/进化原结构，技能保留三种来源各一例。
const modern = "<div class=\"sd-p-page\">\n<div class=\"sd-p-stat-list\">\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">生命</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"HP\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:48%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">86</div>\n</div>\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">物攻</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"ATK\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:28%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">50</div>\n</div>\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">魔攻</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"MATK\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:56%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">100</div>\n</div>\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">物防</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"DEF\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:34%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">61</div>\n</div>\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">魔防</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"MDEF\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:57%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">103</div>\n</div>\n<div class=\"sd-p-stat\">\n<div class=\"sd-p-stat-name\">\n<div class=\"sd-p-stat-text\">\n<div class=\"sd-p-stat-label\">速度</div>\n<div class=\"sd-p-stat-rune\" data-rune=\"SPD\" aria-hidden=\"true\">\n</div>\n</div>\n</div>\n<div class=\"sd-p-stat-track\">\n<div class=\"sd-p-stat-fill\" style=\"width:36%;\">\n</div>\n</div>\n<div class=\"sd-p-stat-number\">64</div>\n</div>\n</div>\n</div>\n<div class=\"sd-p-measures\">\n<div class=\"sd-p-measure\">\n<div class=\"sd-p-measure-label\">身高</div>\n<div class=\"sd-p-measure-value\">0.21~0.33M</div>\n</div>\n<div class=\"sd-p-measure\">\n<div class=\"sd-p-measure-label\">体重</div>\n<div class=\"sd-p-measure-value\">0.6~1.5KG</div>\n</div>\n</div>\n<div class=\"sd-p-facts\">\n<div class=\"sd-p-fact sd-p-fact-wide\">\n<div class=\"sd-p-label\">蛋组</div>\n<div class=\"sd-p-value\">昆虫组 / 植物组</div>\n</div>\n</div>\n<div class=\"sd-p-relations\">\n</div>\n<div class=\"sd-p-skill-card\" data-nrc-tag=\"button\" role=\"button\" tabindex=\"0\" data-sd-p-skill=\"level-skill_000647-1\" data-source=\"level\" data-type=\"虫系\" data-category=\"魔攻\" data-name=\"虫刺\" data-search=\"虫刺 造成魔伤，3连击。\" data-order=\"1\" data-level=\"1\" data-power=\"15\" data-energy=\"1\" aria-label=\"虫刺，查看详情\">\n<div class=\"sd-p-skill-visual\">\n<div class=\"sd-p-skill-icon\">\n</div>\n<div class=\"sd-p-skill-energy\">1</div>\n</div>\n<div class=\"sd-p-skill-category-icon\">\n</div>\n<div class=\"sd-p-skill-name\">虫刺</div>\n<div class=\"sd-p-skill-meta\">\n<div class=\"sd-p-skill-type\">\n<span class=\"sd-type\">\n<span>虫系</span>\n</span>\n</div>\n<div class=\"sd-p-skill-power\">威力 <div class=\"sd-p-power-number\">15</div>\n</div>\n<div class=\"sd-p-learning\">Lv.1</div>\n</div>\n<div class=\"sd-p-skill-description\">造成魔伤，3连击。</div>\n</div>\n<div class=\"sd-p-skill-card\" data-nrc-tag=\"button\" role=\"button\" tabindex=\"0\" data-sd-p-skill=\"machine-skill_000643-14\" data-source=\"machine\" data-type=\"虫系\" data-category=\"状态\" data-name=\"虫群智慧\" data-search=\"虫群智慧 己方队伍获得2次随机奉献。\" data-order=\"14\" data-level=\"999\" data-power=\"-1\" data-energy=\"3\" aria-label=\"虫群智慧，查看详情\">\n<div class=\"sd-p-skill-visual\">\n<div class=\"sd-p-skill-icon\">\n</div>\n<div class=\"sd-p-skill-energy\">3</div>\n</div>\n<div class=\"sd-p-skill-category-icon\">\n</div>\n<div class=\"sd-p-skill-name\">虫群智慧</div>\n<div class=\"sd-p-skill-meta\">\n<div class=\"sd-p-skill-type\">\n<span class=\"sd-type\">\n<span>虫系</span>\n</span>\n</div>\n<div class=\"sd-p-skill-power\">威力 <div class=\"sd-p-power-number\">—</div>\n</div>\n<div class=\"sd-p-learning\">技能石</div>\n</div>\n<div class=\"sd-p-skill-description\">己方队伍获得2次随机奉献。</div>\n</div>\n<div class=\"sd-p-skill-card\" data-nrc-tag=\"button\" role=\"button\" tabindex=\"0\" data-sd-p-skill=\"blood-skill_000304-27\" data-source=\"blood\" data-type=\"普通系\" data-category=\"魔攻\" data-name=\"拍击\" data-search=\"拍击 对敌方精灵造成魔法伤害。 普通\" data-order=\"27\" data-level=\"15\" data-power=\"65\" data-energy=\"1\" aria-label=\"拍击，查看详情\">\n<div class=\"sd-p-skill-visual\">\n<div class=\"sd-p-skill-icon\">\n</div>\n<div class=\"sd-p-skill-energy\">1</div>\n</div>\n<div class=\"sd-p-skill-category-icon\">\n</div>\n<div class=\"sd-p-skill-name\">拍击</div>\n<div class=\"sd-p-skill-meta\">\n<div class=\"sd-p-skill-type\">\n<span class=\"sd-type\">\n<span>普通系</span>\n</span>\n</div>\n<div class=\"sd-p-skill-power\">威力 <div class=\"sd-p-power-number\">65</div>\n</div>\n<div class=\"sd-p-learning\">普通血脉 · Lv.15</div>\n</div>\n<div class=\"sd-p-skill-description\">对敌方精灵造成魔法伤害。</div>\n</div>\n<div class=\"sd-p-empty\">\n</div>\n<div class=\"sd-p-evo-group\" id=\"sd-p-evo-branch-1\" data-sd-p-evo-branch=\"1\">\n<div class=\"sd-p-evo-chain\">\n<div class=\"sd-p-evo-node\" data-roman=\"I\">\n<div class=\"sd-p-evo-card is-current\">\n<div class=\"sd-p-evo-avatar\">\n</div>\n<div class=\"sd-p-evo-name\">\n<div class=\"sd-p-evo-name-main\">\n<a class=\"mw-selflink selflink\">西瓜虫</a>\n</div>\n<div class=\"sd-p-evo-name-sub\">初阶 · 虫 / 草</div>\n</div>\n</div>\n</div>\n<div class=\"sd-p-evo-connector\" data-stage=\"2\">\n<div class=\"sd-p-evo-condition\">\n<div class=\"sd-p-evo-dot\">\n</div>Lv.33</div>\n</div>\n<div class=\"sd-p-evo-node is-last\" data-roman=\"II\">\n<div class=\"sd-p-evo-card\">\n<div class=\"sd-p-evo-avatar\">\n</div>\n<div class=\"sd-p-evo-name\">\n<div class=\"sd-p-evo-name-main\">\n<a href=\"/nrc/%E5%86%AC%E8%99%AB%E5%A4%8F%E7%93%9C\" title=\"冬虫夏瓜\">冬虫夏瓜</a>\n</div>\n<div class=\"sd-p-evo-name-sub\">二阶 · 虫 / 草</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>"
const S5_SNAPSHOT_SHA = "aaa562eee7e8c81da59213c036aa0f40dc7bbb1b81a0b1e1d87be4014e385050"

test('S5 完整卡片、普通及异色图与快照一致，初阶18只与已上线异色总图一致', () => {
  const pets = JSON.parse(fs.readFileSync(new URL('../models/pet-dex-data.json', import.meta.url), 'utf8'))
  const s5 = pets.filter(p => p.season === 'S5')
  assert.equal(s5.length, 46)
  assert.equal(createHash('sha256').update(JSON.stringify(s5)).digest('hex'), S5_SNAPSHOT_SHA)
  assert.ok(s5.every(p => p.artNormal && (!p.shiny || p.artShiny)))
  for (const expected of getSeasonData('S5').pets) {
    const found = findPet(expected.name)
    const actual = found?.candidates ? found.candidates.find(p => p.formLabel === '本来的样子') : found
    assert.ok(actual?.id, expected.name)
    assert.equal(actual.number, expected.number)
    assert.deepEqual(actual.types, expected.types)
    assert.equal(actual.artShiny, expected.img)
  }
  assert.equal(findPetByNumber('494'), null, '空占位不进入索引')
  assert.equal(findPetByNumber('495'), null)
  assert.equal(findPetByNumber('496'), null)
})

test('西瓜虫名称、前缀、487编号和搜索命中同一张准确卡片', () => {
  const pet = findPet('西瓜虫')
  assert.deepEqual(pet, {
    id: 'pet_000657', number: '487', form: 'main', shiny: true, season: 'S5', types: ['虫', '草'], name: '西瓜虫', formLabel: '',
    artNormal: 'https://patchwiki.biligame.com/images/nrc/d/de/9n8i73uallik1nxxqnt6csogj1lib5v.png',
    artShiny: 'https://patchwiki.biligame.com/images/nrc/e/e2/r81ydsfmpyo2mae4edqnwwky9njwl7f.png',
    page: '/nrc/%E8%A5%BF%E7%93%9C%E8%99%AB'
  })
  assert.equal(findPet('西瓜'), pet)
  assert.equal(findPetByNumber('487'), pet)
  assert.deepEqual(searchPets('西瓜虫'), [pet])
  assert.equal(findPet('冬虫夏瓜').number, '488')
  assert.equal(findPet('小冥龙').number, '469')
  assert.equal(findPet('阿布').number, '493')
})

test('新增阿瓦鲨保留两个478形态，不按同编号去重', () => {
  const found = findPet('阿瓦鲨')
  assert.equal(found.total, 2)
  assert.deepEqual(found.candidates.map(displayName), ['阿瓦鲨（柠檬鲨的样子）', '阿瓦鲨（虎纹鲨的样子）'])
  assert.equal(findPetByNumber('478').total, 2)
  for (const p of found.candidates) {
    assert.equal(findPet(displayName(p)), p)
    assert.equal(findPet(p.name + p.formLabel), p)
  }
  assert.notEqual(found.candidates[0].page, found.candidates[1].page)
})

test('新版sd-p真实片段解析种族值、基础信息、三种技能来源和进化条件', () => {
  const detail = parsePetDetail(modern, { pet: findPet('西瓜虫') })
  assert.deepEqual(detail.stats, [
    { name: '生命', value: 86 }, { name: '物攻', value: 50 }, { name: '魔攻', value: 100 },
    { name: '物防', value: 61 }, { name: '魔防', value: 103 }, { name: '速度', value: 64 }
  ])
  assert.deepEqual(detail.pills, [{ key: '身高', value: '0.21~0.33M' }, { key: '体重', value: '0.6~1.5KG' }, { key: '蛋组', value: '昆虫组 / 植物组' }])
  assert.deepEqual(detail.skills, [
    { name: '虫刺', type: '虫', cat: '魔攻', power: '15', source: 'level', cost: '1', level: '1', desc: '造成魔伤，3连击。' },
    { name: '虫群智慧', type: '虫', cat: '状态', power: '—', source: 'machine', cost: '3', level: '', desc: '己方队伍获得2次随机奉献。' },
    { name: '拍击', type: '普通', cat: '魔攻', power: '65', source: 'blood', cost: '1', level: '15', desc: '对敌方精灵造成魔法伤害。' }
  ])
  assert.deepEqual(detail.branches, [{ name: '', nodes: [{ name: '西瓜虫', roman: 'I', current: true }, { name: '冬虫夏瓜', roman: 'II', current: false }], conns: ['Lv.33'] }])
  assert.equal(detail.evolveChain, true)
  assert.deepEqual(detail.identity, { number: '487', name: '西瓜虫', types: ['虫', '草'], form: '', season: 'S5' })
})

test('新版基础信息不吞入其他面板，缺省和旧版解析仍隔离', () => {
  const decoy = '<div class="sd-p-section"><div class="sd-p-label">能耗</div><div class="sd-p-value">999</div></div>'
  const withoutRelations = modern.replace('<div class="sd-p-relations"></div>', decoy)
  assert.deepEqual(parsePetDetail(withoutRelations).pills.map(p => p.key), ['身高', '体重', '蛋组'])
  assert.equal(parsePetDetail(modern, null).identity, null)
  assert.equal(parsePetDetail(dimo).skills.length, parsePetDetail(dimo + modern).skills.length, '不能重复解析两套模板')
})

const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-pet-dex-'))
const cacheData = path.join(cacheRoot, 'data')
const modelURL = new URL('../models/pet-dex.js?pet-dex-isolated-test', import.meta.url).href
const appURL = new URL('../apps/pet-dex.js', import.meta.url).href
const stateKey = '__rocomPetDexTest'
const state = { allowGroup: true, renders: [], fetches: [], image: { type: 'image', data: 'isolated-test-render' } }
globalThis[stateKey] = state
const dataURL = source => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
const bindings = {
  [modelURL]: { '../components/paths.js': dataURL('export const dataDir = ' + JSON.stringify(cacheData) + ';') },
  [appURL]: {
    '../models/pet-dex.js': modelURL,
    '../components/index.js': dataURL('const state = globalThis.' + stateKey + '; export class BaseApp { constructor(options) { Object.assign(this, options) } async checkGroup(e) { return !e.isGroup || state.allowGroup } args(e, prefix) { return String(e.msg || "").replace(prefix, "").trim().split(/\\s+/).filter(Boolean) } } export const log = { w() {} };'),
    '../render/pet-dex-renderer.js': dataURL('export async function renderPetDex(data) { const state = globalThis.' + stateKey + '; state.renders.push(data); return state.image; }')
  }
}
register(dataURL('const bindings = ' + JSON.stringify(bindings) + '; export function resolve(specifier, context, nextResolve) { const url = bindings[context.parentURL]?.[specifier]; return url ? { url, shortCircuit: true } : nextResolve(specifier, context); }'), import.meta.url)
const isolatedModel = await import(modelURL)
const { RocomPetDex } = await import(appURL)
const originalFetch = globalThis.fetch
globalThis.fetch = async url => {
  state.fetches.push(String(url))
  const pet = findPet('西瓜虫')
  if (String(url) === 'https://wiki.biligame.com' + pet.page) return new Response(modern)
  if ([pet.artNormal, pet.artShiny].includes(String(url))) return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+9wAAAABJRU5ErkJggg==', 'base64'))
  throw new Error('Unexpected test network access: ' + url)
}
after(() => {
  globalThis.fetch = originalFetch
  delete globalThis[stateKey]
  fs.rmSync(cacheRoot, { recursive: true, force: true })
})

test('缓存兼容：重抓TTL内旧解析器空记录，保留完整缓存，过期与force仍生效', async () => {
  const pet = isolatedModel.findPet('西瓜虫')
  const dir = path.join(cacheData, 'pet_dex_pages')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, pet.id + '.json')
  const stale = parsePetDetail('')
  fs.writeFileSync(file, JSON.stringify(stale))
  let fetches = 0
  const fetcher = async url => { assert.equal(url, 'https://wiki.biligame.com' + pet.page); fetches++; return modern }
  const current = await isolatedModel.getPetDetail(pet, { fetcher })
  assert.equal(fetches, 1, '空记录不能被TTL掩盖')
  assert.equal(current.stats.length, 6)
  const reused = await isolatedModel.getPetDetail(pet, { fetcher: async () => { throw new Error('完整缓存不应重抓') } })
  assert.deepEqual(reused, current)
  const legacy = parsePetDetail(dimo, { pet: findPet('迪莫') })
  const legacyFile = path.join(dir, findPet('迪莫').id + '.json')
  fs.writeFileSync(legacyFile, JSON.stringify(legacy))
  assert.deepEqual(await isolatedModel.getPetDetail(findPet('迪莫'), { fetcher: async () => { throw new Error('无需清空旧版完整缓存') } }), legacy)
  fs.writeFileSync(file, JSON.stringify({ ...current, fetchedAt: new Date(Date.now() - 8 * 86400000).toISOString() }))
  await isolatedModel.getPetDetail(pet, { fetcher })
  assert.equal(fetches, 2)
  await isolatedModel.getPetDetail(pet, { fetcher, force: true })
  assert.equal(fetches, 3)
  await assert.rejects(isolatedModel.getPetDetail(pet, { fetcher: async () => { throw new Error('fetch failed') }, force: true }), /fetch failed/)
  assert.equal(await isolatedModel.getPetDetail(null), null)
})

async function dispatchPet(msg) {
  const app = new RocomPetDex()
  const replies = []
  const e = { msg, isGroup: true, group_id: 12345, reply: async value => { replies.push(value); return true } }
  const rule = app.rule.find(r => new RegExp(r.reg).test(msg))
  assert.ok(rule, msg)
  return { replies, result: await app[rule.fnc](e) }
}

test('真实应用路由：#精灵 西瓜虫、#精灵编号487、#精灵搜索西瓜虫', async () => {
  state.renders = []
  for (const msg of ['#精灵 西瓜虫', '#精灵编号487']) {
    const { replies } = await dispatchPet(msg)
    assert.deepEqual(replies, [state.image], msg)
    const data = state.renders.at(-1)
    assert.equal(data.title, '西瓜虫')
    assert.equal(data.number, '487')
    assert.deepEqual(data.types, ['虫', '草'])
    assert.equal(data.season, 'S5')
    assert.equal(data.stats.length, 6)
    assert.equal(data.skills[0].name, '虫刺')
    assert.equal(data.branches[0].nodes[1].name, '冬虫夏瓜')
    assert.ok(data.artNormal.startsWith('file:'))
    assert.ok(data.artShiny.startsWith('file:'))
    assert.notEqual(data.artNormal, data.artShiny)
  }
  assert.equal(state.renders.length, 2)
  assert.deepEqual((await dispatchPet('#精灵搜索西瓜虫')).replies, ['找到 1 条精灵形态：\n#精灵 西瓜虫 — 487 虫/草 有异色\n查看详情：#精灵 <名称>'])
  assert.equal(state.renders.length, 2, '搜索不应渲染详情')
})

test('应用保留群开关、歧义候选、未命中与渲染文字兜底', async () => {
  state.allowGroup = false
  assert.deepEqual(await dispatchPet('#精灵 西瓜虫'), { replies: [], result: false })
  state.allowGroup = true
  assert.match((await dispatchPet('#精灵 不存在的精灵xyz')).replies[0], /没有找到名称包含/)
  const candidates = (await dispatchPet('#精灵 阿瓦鲨')).replies[0]
  assert.ok(candidates.includes('#精灵 阿瓦鲨（柠檬鲨的样子）'))
  assert.ok(candidates.includes('#精灵 阿瓦鲨（虎纹鲨的样子）'))
  assert.match((await dispatchPet('#精灵编号018')).replies[0], /4 个形态/)
  state.image = null
  const fallback = (await dispatchPet('#精灵 西瓜虫')).replies[0]
  assert.ok(fallback.includes('【西瓜虫】编号 487 · 虫/草系'))
  assert.ok(fallback.includes('生命 86'))
  assert.ok(fallback.includes('进化：西瓜虫（当前） → 冬虫夏瓜'))
  assert.ok(fallback.includes('图片渲染失败，文字兜底'))
})
