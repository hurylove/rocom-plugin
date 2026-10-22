import fs from 'node:fs'
import { pluginDir } from './paths.js'

const MAX_SECTIONS = 12
const MAX_ITEMS = 12
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

/** 解析 help.md：只认 1-3 级标题与列表项 */
export function parseHelp(source) {
  const sections = []
  let cur = null
  for (const raw of String(source ?? '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^<!--|^-->$/.test(line)) continue
    const h = line.match(/^#{1,3}\s+(.+)$/)
    if (h) {
      if (cur) sections.push(cur)
      cur = { title: clean(h[1]), items: [] }
      continue
    }
    if (!cur) continue
    const item = line.match(/^[-*+]\s+(.+)$/)
    if (item) cur.items.push(inline(item[1]))
  }
  if (cur) sections.push(cur)
  return sections
    .filter((s) => s.title && s.items.length)
    .slice(0, MAX_SECTIONS)
    .map((s) => ({ ...s, items: s.items.slice(0, MAX_ITEMS) }))
}

export function helpData() {
  return {
    title: '指令帮助',
    subtitle: '洛克王国世界 · rocom-plugin',
    sections: parseHelp(fs.readFileSync(helpMarkdown, 'utf-8')),
    footer: '数据来源 db.18183.com'
  }
}
