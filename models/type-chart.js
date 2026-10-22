import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dataDir, log } from '../components/index.js'

const ICON_DIR = path.join(dataDir, 'type_icons')
const ICON_BASE = 'https://arkmeng.cn/storage/files/'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 18 个系，顺序即克制表列序 */
export const TYPES = ['火', '水', '草', '电', '冰', '武', '毒', '地', '翼', '萌', '虫', '幽', '龙', '恶', '机械', '光', '幻', '普通']

/**
 * 克制表，行=攻击方，列=防守方，列序同 TYPES。
 * 每行 18 个字符：2=2×、1=0.5×、0=1×
 */
const ROWS = {
  火: '012020010020102000',
  水: '201010020000102000',
  草: '120000121010101200',
  电: '021100012000100000',
  冰: '102010022000201000',
  武: '000020121111022012',
  毒: '002000110201001000',
  地: '201221200000000000',
  翼: '002102010020101000',
  萌: '100002100000221000',
  虫: '102001101101021020',
  幽: '000000000002010221',
  龙: '000000000000201000',
  恶: '000001200202010100',
  机械: '110120020200001000',
  光: '001010000002020000',
  幻: '000002200000001110',
  普通: '000000010001001000'
}

/** 玩家常用叫法 → 本表系名 */
const ALIAS = {
  格斗: '武', 武术: '武', 战斗: '武',
  飞行: '翼', 鸟: '翼',
  幽灵: '幽', 鬼: '幽',
  暗: '恶', 邪恶: '恶', 黑暗: '恶',
  钢: '机械', 铁: '机械',
  地面: '地',
  超能: '幻', 超能力: '幻', 精神: '幻', 念力: '幻',
  妖精: '萌', 可爱: '萌',
  一般: '普通', 通常: '普通'
}

const CHART = Object.fromEntries(
  Object.entries(ROWS).map(([attacker, row]) => [
    attacker,
    Object.fromEntries([...row].map((ch, i) => [TYPES[i], ch === '2' ? 2 : ch === '1' ? 0.5 : 1]))
  ])
)

for (const [attacker, row] of Object.entries(ROWS)) {
  if (row.length !== TYPES.length) {
    logger.error(`[rocom] 克制表 ${attacker} 行长度 ${row.length}，应为 ${TYPES.length}`)
  }
}

/** 把用户输入解析成系名数组（最多 2 个） */
export function parseTypes(text) {
  const picked = []
  for (const raw of String(text || '').split(/[\s,，、/+]+/).filter(Boolean)) {
    const name = raw.replace(/系$/, '')
    const type = TYPES.includes(name) ? name : ALIAS[name]
    if (type && !picked.includes(type)) picked.push(type)
    if (picked.length === 2) break
  }
  return picked
}

const group = (entries) => {
  const out = { x4: [], x2: [], x05: [], x025: [] }
  for (const [type, value] of entries) {
    if (value === 4) out.x4.push(type)
    else if (value === 2) out.x2.push(type)
    else if (value === 0.5) out.x05.push(type)
    else if (value === 0.25) out.x025.push(type)
  }
  return out
}

/** 我方用这 1-2 个系进攻：对每个防守系的倍率 */
export function attackGroups(types) {
  return group(TYPES.map((defender) => [defender, types.reduce((acc, a) => acc * (CHART[a]?.[defender] ?? 1), 1)]))
}

/** 我方是这 1-2 个系：对每个进攻系的倍率（即被打时的倍率） */
export function defendGroups(types) {
  return group(TYPES.map((attacker) => [attacker, types.reduce((acc, d) => acc * (CHART[attacker]?.[d] ?? 1), 1)]))
}

/** 完整矩阵，供总表使用 */
export function fullChart() {
  return TYPES.map((attacker) => ({
    type: attacker,
    cells: TYPES.map((defender) => {
      const value = CHART[attacker][defender]
      return { type: defender, value, text: value === 2 ? '2' : value === 0.5 ? '½' : '' }
    })
  }))
}

function ensureIconDir() {
  if (!fs.existsSync(ICON_DIR)) fs.mkdirSync(ICON_DIR, { recursive: true })
}

/** 系别图标缓存到本地，返回 file:// 地址；失败返回空串 */
async function iconUrl(type) {
  const file = `${type}.png`
  const save = path.join(ICON_DIR, file)
  try {
    if (!fs.existsSync(save) || fs.statSync(save).size < 200) {
      ensureIconDir()
      const encoded = `图片/属性/${type}系.png`.split('/').map(encodeURIComponent).join('/')
      const res = await fetch(ICON_BASE + encoded, {
        headers: { 'User-Agent': UA, Referer: 'https://arkmeng.cn/type-chart' },
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 200) throw new Error('图标过小')
      fs.writeFileSync(save, buf)
    }
    return pathToFileURL(save).href
  } catch (err) {
    log.w(`系别图标 ${type} 获取失败：${err.message}`)
    return ''
  }
}

async function withIcons(groups) {
  const out = {}
  for (const key of ['x4', 'x2', 'x05', 'x025']) {
    out[key] = await Promise.all(groups[key].map(async (type) => ({ type, icon: await iconUrl(type) })))
  }
  return out
}

const hasAny = (groups) => ['x4', 'x2', 'x05', 'x025'].some((key) => groups[key].length)

/** 单个/双系查询：进攻与防守一起算 */
export async function queryTypes(types) {
  const attack = attackGroups(types)
  const defend = defendGroups(types)
  const selected = await Promise.all(types.map(async (type) => ({ type, icon: await iconUrl(type) })))
  log.d(`系别克制 ${types.join('+')} 进攻 ${attack.x2.length + attack.x4.length} 条、防守 ${defend.x2.length + defend.x4.length} 条`)
  return {
    types,
    selected,
    attack: { ...(await withIcons(attack)), empty: !hasAny(attack) },
    defend: { ...(await withIcons(defend)), empty: !hasAny(defend) }
  }
}

/** 总表：18×18 矩阵 + 每系图标 */
export async function queryFullChart() {
  const rows = fullChart()
  const icons = {}
  for (const type of TYPES) icons[type] = await iconUrl(type)
  return { types: TYPES, rows, icons }
}
