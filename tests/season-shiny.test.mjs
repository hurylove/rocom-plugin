import { test, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { register } from 'node:module'
import { SEASONS, getSeasonData } from '../models/season-shiny.js'
import { parseHelp } from '../components/help.js'

// Wiki snapshot 2026-11-05: S5 + shiny=yes + position.split('|').includes('initial').
// Images are the exact .npc-art-shiny img sources, in card order; no deduplication.
const expectedS5 = [
  ["092","锤头鹳","翼|水","2/28/e07ejtpknfuqrobzai3dnz7ep9tn5kt.png"],
  ["201","花怨鳗","地|草","d/de/qcyh60pm6xc7a45om97didk62nveph0.png"],
  ["203","伊雷龙","龙","8/83/gii8jz1sy227sht0ny46wk6bwy2nh7t.png"],
  ["224","小翼龙","龙|翼","2/21/gbgm6b6kvojn6j6tk15muqs8wr7dbu2.png"],
  ["229","缇塔","机械","8/84/or238uzrfcdvjumwqx9r5mcbt08195s.png"],
  ["249","可爱猿","火","9/98/icucng2gt8tkv3ubhvzicxsdm9jlwws.png"],
  ["273","深蓝鲸","水","6/6c/mckicfv6wjezxyzyf81gri0tuyo0q39.png"],
  ["287","吸泥鸥","地|翼","4/4e/0ze13gmh2z3so8lw01ul771tdq467vh.png"],
  ["471","地银链","地","6/61/qtz6g1b7n54ln3r9wim4dr9c0lmvr83.png"],
  ["474","沉金兽","电","0/04/c1mdqocxfs6yjj2tmoptmxfauq6n585.png"],
  ["477","乐乐鲨","水","e/e4/dg00owlowj4rt6iyr070ekq9miw78ig.png"],
  ["479","蛋包蛋","普通|萌","3/30/56qtel4732oy4n6pvp474ktjy6tgf4t.png"],
  ["481","蟹蟹椰","水|草","9/9c/nbekruxwdbroj3bnfvdcj4rk8t3re3d.png"],
  ["483","鲸羽","幻|冰","a/a9/h2pd1t9dxzqqfa8xoh3a80w99ezjnao.png"],
  ["485","豆粒鹅","冰","0/0d/q1isp18ncev630teus144x7shjmpzgy.png"],
  ["487","西瓜虫","虫|草","e/e2/r81ydsfmpyo2mae4edqnwwky9njwl7f.png"],
  ["489","小剪影","幽","8/88/d9toeeovkl8tkjx64h4vtd6byvdizoq.png"],
  ["491","滴溜豚","毒|幻","f/f9/803m4xtfcmxobfaeky44b35jnslem8u.png"]
].map(([number, name, types, image]) => ({
  number, name, types: types.split('|'), img: 'https://patchwiki.biligame.com/images/nrc/' + image
}))
const oldSeasons = {
  S1: [19, '54fc5ee81b8f5bdf5704e2426385cb19d1e815d752ca63e46573d8a27484abd9'],
  S2: [18, '4761b8a69516896ead3a84a9490e04cbfe3e251336e22de34ad38bba6f3e3c51'],
  S3: [20, '43b63446bf090783e7af4914a4b99fbffbdbf86684482bd43e7b1b50c627c2bf'],
  S4: [19, '1cb1786c9ec3c855b689bc4a3656a0f622e253149ec23eae7b5b5d86e421c5ad']
}
const hash = value => createHash('sha256').update(value).digest('hex')
const stateKey = '__rocomSeasonShinyTest'
const state = {}
globalThis[stateKey] = state
const originalFetch = globalThis.fetch
globalThis.fetch = async () => { throw new Error('Season shiny tests must not access the network') }
const appURL = new URL('../apps/season-shiny.js', import.meta.url).href
const dataURL = source => 'data:text/javascript;charset=utf-8,' + encodeURIComponent(source)
const prelude = 'const state = globalThis.' + stateKey + ';\n'
const stubs = {
  '../components/index.js': dataURL(prelude + [
    'export class BaseApp {',
    '  constructor(options) { Object.assign(this, options) }',
    '  async checkGroup(e) { state.calls.push("group"); return !e.isGroup || state.allowGroup }',
    '}',
    'export const log = { i: (...args) => state.logs.push(args), w: (...args) => state.logs.push(args) }'
  ].join('\n')),
  '../render/season-shiny-renderer.js': dataURL(prelude + [
    'export async function renderSeasonShiny(season) {',
    '  state.calls.push("render"); state.seasons.push(season); return state.image;',
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
const { RocomSeasonShiny } = await import(appURL)

beforeEach(() => {
  Object.assign(state, { allowGroup: true, calls: [], logs: [], seasons: [], image: { type: 'image', data: 'fixture' } })
})
after(() => {
  delete globalThis[stateKey]
  globalThis.fetch = originalFetch
})

async function dispatch(msg, event = {}) {
  const app = new RocomSeasonShiny()
  const replies = []
  const e = { msg, isGroup: true, group_id: 12345, ...event, reply: async value => { replies.push(value); return true } }
  const rule = app.rule.find(rule => new RegExp(rule.reg).test(msg))
  assert.ok(rule, 'Expected command to match: ' + msg)
  return { app, replies, result: await app[rule.fnc](e) }
}

test('S5 metadata and all 18 Wiki cards match exact names, numbers, types and shiny art', () => {
  assert.deepEqual(SEASONS, ['S1', 'S2', 'S3', 'S4', 'S5'])
  const season = getSeasonData('s5')
  assert.deepEqual({ id: season.id, name: season.name, accent: season.accent, accent2: season.accent2 }, {
    id: 'S5', name: '圣龙宝藏', accent: '#7a5a20', accent2: '#f0c96a'
  })
  assert.equal(season.pets.length, 18)
  assert.deepEqual(season.pets, expectedS5)
  assert.deepEqual(getSeasonData('S5'), season)
})

for (const [id, [count, expectedHash]] of Object.entries(oldSeasons)) {
  test(id + ' metadata, ordered pets and image URLs retain their baseline hash', () => {
    const season = getSeasonData(id)
    assert.equal(season.pets.length, count)
    assert.equal(hash(JSON.stringify(season)), expectedHash)
    assert.deepEqual(getSeasonData(id.toLowerCase()), season)
  })
}

test('S1-S4 metadata and pet source blocks are byte-identical to the baseline', () => {
  const source = readFileSync(new URL('../models/season-shiny.js', import.meta.url), 'utf8')
  const meta = source.split('const SEASON_META = {\n')[1].split(',\n  "S5": {')[0]
  const pets = source.split('const SEASON_PETS = {\n')[1].split(',\n  "S5": [')[0]
  assert.equal(hash(meta), '14071ef851a3adc5bc46837b27b4aaeaf0349b3992ac00f8b5b4c94bcde95521')
  assert.equal(hash(pets), '24412b78ec62d6550faadbef0335cdb12625ebb431611a1b0b3c7b6505567ee1')
})

test('existing equal-number forms are retained rather than deduplicated', () => {
  assert.deepEqual(getSeasonData('S3').pets.filter(pet => pet.number === '076').map(pet => pet.name), ['海盔虫', '海盔虫（磨损的样子）'])
  assert.deepEqual(getSeasonData('S4').pets.filter(pet => pet.number === '237').map(pet => pet.name), ['刺轮砣（上弦的样子）', '刺轮砣（下弦的样子）'])
})

test('invalid season keys still return null', () => {
  for (const key of [undefined, null, '', 'S0', 'S6', 'S10', 'S05', ' S5', '#S5', 's5异色', '__proto__', 'constructor']) {
    assert.equal(getSeasonData(key), null, String(key))
  }
})

for (const msg of ['#s5异色', '#S5异色', 's5异色', 'S5异色']) {
  test(msg + ' is recognized and renders the full S5 data after the group gate', async () => {
    const { result, replies } = await dispatch(msg)
    assert.equal(result, true)
    assert.deepEqual(state.calls, ['group', 'render'])
    assert.deepEqual(state.seasons, [getSeasonData('S5')])
    assert.deepEqual(replies, [state.image])
  })
}

test('all S1-S4 case and optional-hash command aliases remain recognized', async () => {
  for (const id of Object.keys(oldSeasons)) for (const prefix of ['', '#']) for (const key of [id, id.toLowerCase()]) {
    const { replies, result } = await dispatch(prefix + key + '异色')
    assert.equal(result, true)
    assert.deepEqual(replies, [state.image])
    assert.deepEqual(state.seasons.at(-1), getSeasonData(id))
  }
})

test('invalid commands do not match, and the handler rejects unknown seasons', async () => {
  const app = new RocomSeasonShiny()
  for (const msg of ['#S0异色', '#S6异色', 's10异色', '#S05异色', '#S5', '##s5异色', '#s5异色额外', 's5普通']) {
    assert.equal(app.rule.some(rule => new RegExp(rule.reg).test(msg)), false, msg)
  }
  const replies = []
  assert.equal(await app.season({ msg: '#S6异色', isGroup: true, reply: value => replies.push(value) }), false)
  assert.deepEqual(state.calls, ['group'])
  assert.deepEqual(replies, [])
})

test('rejected group does not render or reply', async () => {
  state.allowGroup = false
  const { result, replies } = await dispatch('#s5异色')
  assert.equal(result, false)
  assert.deepEqual(state.calls, ['group'])
  assert.deepEqual(state.seasons, [])
  assert.deepEqual(replies, [])
})

test('private message keeps the existing BaseApp group-gate behavior', async () => {
  state.allowGroup = false
  const { result, replies } = await dispatch('S5异色', { isGroup: false })
  assert.equal(result, true)
  assert.deepEqual(state.calls, ['group', 'render'])
  assert.deepEqual(replies, [state.image])
})

test('render-null fallback replies with every S5 card, exact number/name/types and season title', async () => {
  state.image = null
  const { result, replies } = await dispatch('#S5异色')
  assert.equal(result, true)
  assert.deepEqual(state.calls, ['group', 'render'])
  assert.equal(replies.length, 1)
  assert.deepEqual(replies[0].split('\n'), [
    'S5 圣龙宝藏 · 有异色 · 进化位置：初始',
    ...expectedS5.map(pet => '· ' + pet.number + ' ' + pet.name + '（' + pet.types.join('/') + '）')
  ])
  assert.equal(state.logs.length, 2)
  assert.match(state.logs[1][0], /退回文字/)
})

test('S4 render-null fallback still retains all 19 cards and both numbered forms', async () => {
  state.image = null
  const { replies } = await dispatch('s4异色')
  const season = getSeasonData('S4')
  assert.deepEqual(replies[0].split('\n'), [
    'S4 月涌狂想 · 有异色 · 进化位置：初始',
    ...season.pets.map(pet => '· ' + pet.number + ' ' + pet.name + '（' + pet.types.join('/') + '）')
  ])
})

test('help parser and README advertise the S5 command in the season section', () => {
  const help = readFileSync(new URL('../resources/help/help.md', import.meta.url), 'utf8')
  const group = parseHelp(help).find(group => group.group === '赛季异色图鉴')
  assert.deepEqual(group.list[0].titles, ['#S1异色', '#S5异色'])
  assert.ok(group.notes.some(note => note.includes('S5 圣龙宝藏')))
  assert.ok(group.notes.some(note => note.includes('大小写皆可') && note.includes('省略')))
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').split('### 赛季异色图鉴')[1].split('### ')[0]
  assert.match(readme, /#S5异色/)
  assert.match(readme, /圣龙宝藏/)
})
