import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
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

test('索引数据完整：633 只，字段齐全', () => {
  const pets = JSON.parse(fs.readFileSync(new URL('../models/pet-dex-data.json', import.meta.url), 'utf-8'))
  assert.equal(pets.length, 633)
  assert.ok(pets.every((p) => p.number && p.name && p.page && p.artNormal))
  assert.ok(pets.every((p) => Array.isArray(p.types) && p.types.length >= 1))
  const shiny = pets.filter((p) => p.shiny)
  assert.equal(shiny.length, 197)
  assert.ok(shiny.every((p) => p.artShiny))
  assert.equal(new Set(pets.map((p) => p.number)).size, 468)
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
