import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { templateDir, config, log } from '../components/index.js'

function localCover(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  try {
    let filename = value.trim()
    if (/^file:/i.test(filename)) {
      const url = new URL(filename)
      if (url.hostname && url.hostname !== 'localhost') return ''
      filename = fileURLToPath(url)
    }
    if (!path.isAbsolute(filename) || filename.startsWith('\\\\') || filename.startsWith('//')) return ''
    if (!/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(filename)) return ''
    if (!fs.statSync(filename).isFile()) return ''
    return pathToFileURL(filename).href
  } catch {
    return ''
  }
}

const text = (value, fallback = '') => {
  if (Array.isArray(value)) return value.map((part) => String(part ?? '')).join('、') || fallback
  return String(value ?? '').trim() || fallback
}

export async function renderActivityReminder(data) {
  try {
    if (!data || !Array.isArray(data.items) || !data.items.length) throw new TypeError('提醒事项不能为空')
    const items = data.items.map((item) => {
      if (!item || typeof item !== 'object' || !text(item.title)) throw new TypeError('提醒事项缺少活动名')
      const hoursBefore = Number(item.hoursBefore)
      if (!Number.isFinite(hoursBefore) || hoursBefore <= 0) throw new TypeError('提醒阶段必须为正数')
      return {
        ...item,
        title: text(item.title),
        category: text(item.category, '活动'),
        rewards: text(item.rewards, '暂未标注奖励'),
        end: text(item.end, text(item.endAt, '暂未标注截止时间')),
        leftText: text(item.leftText, '即将结束'),
        hoursBefore,
        cover: localCover(item.cover)
      }
    })
    return (await Puppeteer.screenshot('rocom_activity_reminder', {
      tplFile: templateDir + 'activity-reminder.html',
      saveId: 'activity-reminder',
      reminder: { nowText: text(data.nowText), updatedAt: text(data.updatedAt), items },
      imgType: 'png',
      renderScale: config.renderScale / 100,
      fontUrl: pathToFileURL(templateDir + 'font/AlimamaFangYuanTiVF.ttf').href
    })) || null
  } catch (err) {
    log.e('活动到期提醒渲染失败：', err)
    return null
  }
}
