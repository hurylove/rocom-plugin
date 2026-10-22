import fs from 'node:fs'
import { pluginDir } from './paths.js'

const MAX_SECTIONS = 12
const MAX_ITEMS = 12
const MAX_NOTES = 6
const MAX_LEN = 300

export const helpMarkdown = pluginDir + 'resources/help/help.md'

const clean = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LEN)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const inline = (v) =>
  esc(clean(v))
    .replace(/`([^`\n]+)`/g, '<span class="cmd">$1</span>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<span class="strong">$1</span>')

/**
 * 一行拆成「指令 + 说明」：
 *   `#远行商人` / 远行商人：查询当前轮次在售货物
 *   -> { titles: ['#远行商人', '远行商人'], desc: '查询…' }
 *
 * 判定为指令需要同时满足：有冒号，且冒号左边除反引号包裹的指令外只剩分隔符。
 * 这样「每日四轮 `08-12` …」这类带反引号但实为补充说明的行会归到 notes。
 */
function parseItem(raw) {
  const text = clean(raw)
  const at = text.search(/[：:]/)
  if (at < 0) return { note: inline(text) }

  const head = text.slice(0, at)
  const titles = [...head.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim()).filter(Boolean)
  if (!titles.length) return { note: inline(text) }

  const leftover = head.replace(/`[^`]*`/g, '').replace(/[\s/、,，或~～+]+/g, '')
  if (leftover) return { note: inline(text) }

  const rest = text.slice(at + 1).trim()
  return { titles, desc: rest ? inline(rest) : '' }
}

/** 解析 help.md：只认 1-3 级标题与列表项 */
export function parseHelp(source) {
  const groups = []
  let cur = null
  for (const raw of String(source ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^<!--|^-->$/.test(line)) continue
    const h = line.match(/^#{1,3}\s+(.+)$/)
    if (h) {
      if (cur) groups.push(cur)
      cur = { group: clean(h[1]), list: [], notes: [] }
      continue
    }
    if (!cur) continue
    const item = line.match(/^[-*+]\s+(.+)$/)
    if (!item) continue
    const parsed = parseItem(item[1])
    if (parsed.note) cur.notes.push(parsed.note)
    else cur.list.push(parsed)
  }
  if (cur) groups.push(cur)
  return groups
    .filter((g) => g.group && (g.list.length || g.notes.length))
    .slice(0, MAX_SECTIONS)
    .map((g) => ({ ...g, list: g.list.slice(0, MAX_ITEMS), notes: g.notes.slice(0, MAX_NOTES) }))
}

export function helpData() {
  const groups = parseHelp(fs.readFileSync(helpMarkdown, 'utf-8'))
  return {
    title: '洛克王国世界',
    subtitle: 'rocom-plugin 指令帮助',
    groups,
    total: groups.reduce((n, g) => n + g.list.length, 0),
    footer: 'rocom-plugin'
  }
}
