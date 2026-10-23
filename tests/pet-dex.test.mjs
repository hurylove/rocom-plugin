import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parsePetDetail } from '../models/pet-dex.js'

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

test('apps/pet-dex.js 结构符合加载器要求', () => {
  const source = fs.readFileSync(new URL('../apps/pet-dex.js', import.meta.url), 'utf-8')
  assert.ok(source.includes('extends BaseApp'))
  assert.ok(source.includes("reg: '^#?精灵\\s*(.+)$'"))
  assert.ok(source.includes("reg: '^#?精灵搜索\\s*(.+)$'"))
  assert.ok(source.includes("reg: '^#?精灵异色\\s*(.+)$'"))
  assert.ok(source.includes("reg: '^#?精灵编号\\s*(.+)$'"))
})
