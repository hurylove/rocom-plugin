import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { dataDir, log } from '../components/index.js'

const WIKI_URL = 'https://wiki.biligame.com/nrc/%E6%B4%BB%E5%8A%A8%E6%A1%A3%E6%A1%88'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const COVERS_DIR = path.join(dataDir, 'activity_covers')
const CACHE_FILE = path.join(dataDir, 'activity_cache.json')

const CATEGORY = {
  gifts: '签到与福利',
  pets: '精灵与探索',
  challenge: '对战与试炼',
  fashion: '时装与摄影',
  events: '节庆与日常'
}

function ensureDirs() {
  if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true })
  }
}

/** 下载单个图片并保存到本地 */
async function downloadImage(url, savePath) {
  try {
    if (fs.existsSync(savePath) && fs.statSync(savePath).size > 1000) {
      return true
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Referer': 'https://wiki.biligame.com/' },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const arrayBuffer = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    if (buffer.length < 500) throw new Error('File too small')
    fs.writeFileSync(savePath, buffer)
    return true
  } catch (err) {
    log.w(`[rocom] 下载活动图片失败: ${url} - ${err.message}`)
    return false
  }
}

/** 从 Wiki HTML 解析活动列表 */
export function parseActivitiesFromHtml(html, now = new Date()) {
  const attr = (s, n) => (s.match(new RegExp('(?:^|\\s)' + n + '="([^"]*)"')) || [])[1] || ''
  const cardRe = /<div class="nrc-activity-card"([^>]*)>([\s\S]*?)(?=<div class="nrc-activity-card"|<div class="nrc-activities-end|<script|$)/g

  const rows = []
  let m
  while ((m = cardRe.exec(html))) {
    const attrs = m[1]
    const body = m[2]
    const start = attr(attrs, 'data-window-start')
    const end = attr(attrs, 'data-window-end')
    if (!start || !end) continue

    const startDate = new Date(start.replace(' ', 'T') + '+08:00')
    const endDate = new Date(end.replace(' ', 'T') + '+08:00')
    if (now > endDate) continue // 已经结束的过滤掉

    // 优先提取 1280px / 960px 高清图，若无则使用常规 cover
    let cover = ''
    const srcsetMatch = body.match(/srcset="([^"]+)"/)
    if (srcsetMatch) {
      const srcset = srcsetMatch[1]
      const highRes = srcset.match(/(\S+)\s+2x/) || srcset.match(/(\S+)\s+1\.5x/)
      if (highRes) cover = highRes[1]
    }
    if (!cover) {
      cover = (body.match(/<div class="nrc-activity-cover-primary">\s*<img[^>]+src="([^"]+)"/) || [])[1] ||
              (body.match(/<div class="nrc-activity-cover-fallback">\s*<img[^>]+src="([^"]+)"/) || [])[1] || ''
    }

    const rewards = (body.match(/<div class="nrc-activity-card-rewards">([\s\S]*?)<\/div>/) || [])[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || ''
    const title = (body.match(/<div class="nrc-activity-title-2"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/) || [])[1]?.trim() || ''
    if (!title || !cover) continue

    const code = attr(attrs, 'data-category') || 'events'
    rows.push({
      id: attr(attrs, 'data-activity-id'),
      title,
      category: CATEGORY[code] || code,
      start: start.slice(0, 16),
      end: end.slice(0, 16),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      status: now < startDate ? 'upcoming' : 'active',
      rewards,
      coverUrl: cover
    })
  }

  // 排序：进行中活动按截止时间从早到晚，即将开启活动按开启时间从早到晚（14天内）
  const activeList = rows
    .filter(a => a.status === 'active')
    .sort((a, b) => new Date(a.endAt) - new Date(b.endAt))

  const upcomingList = rows
    .filter(a => a.status === 'upcoming' && (new Date(a.startAt) - now <= 14 * 86400000))
    .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))

  return {
    totalActive: activeList.length,
    totalUpcoming: upcomingList.length,
    active: activeList,
    upcoming: upcomingList
  }
}

/** 执行活动数据更新并下载图片到本地缓存 */
export async function updateActivityData() {
  ensureDirs()
  log.i('[rocom] 正在更新活动档案数据...')
  try {
    const res = await fetch(WIKI_URL, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const parsed = parseActivitiesFromHtml(html)

    // 并发/排队下载所有封面
    const allActivities = [...parsed.active, ...parsed.upcoming]
    let downloadCount = 0

    for (const act of allActivities) {
      if (!act.coverUrl) continue
      const ext = path.extname(new URL(act.coverUrl).pathname) || '.png'
      const hash = crypto.createHash('md5').update(act.coverUrl).digest('hex').slice(0, 12)
      const fileName = `${act.id || 'act'}_${hash}${ext}`
      const localFilePath = path.join(COVERS_DIR, fileName)

      const ok = await downloadImage(act.coverUrl, localFilePath)
      if (ok) {
        act.localCover = pathToFileURL(localFilePath).href
        downloadCount++
      } else {
        // 兜底保留原网络地址
        act.localCover = act.coverUrl
      }
    }

    const cacheData = {
      updatedAt: new Date().toISOString(),
      totalActive: parsed.totalActive,
      totalUpcoming: parsed.totalUpcoming,
      active: parsed.active.map(a => ({
        id: a.id,
        title: a.title,
        category: a.category,
        start: a.start,
        end: a.end,
        rewards: a.rewards,
        cover: a.localCover || a.coverUrl
      })),
      upcoming: parsed.upcoming.map(a => ({
        id: a.id,
        title: a.title,
        category: a.category,
        start: a.start,
        end: a.end,
        rewards: a.rewards,
        cover: a.localCover || a.coverUrl
      }))
    }

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8')
    log.i(`[rocom] 活动档案更新完成：进行中 ${cacheData.totalActive} 个，即将开启 ${cacheData.totalUpcoming} 个，下载/核验图片 ${downloadCount} 张`)
    return cacheData
  } catch (err) {
    log.e('[rocom] 活动档案抓取失败：', err.message)
    return null
  }
}

/** 获取当前活动总览数据（优先读本地缓存，无缓存时尝试抓取，再无时退回静态内置） */
export function getLocalActivityOverview() {
  ensureDirs()
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
      // 检查 localCover 对应的本地文件是否存在，如果是 file:// 转换检查
      for (const list of [data.active, data.upcoming]) {
        for (const item of (list || [])) {
          if (item.cover && item.cover.startsWith('file://')) {
            try {
              const filePath = new URL(item.cover)
              if (!fs.existsSync(filePath)) {
                // 如果本地文件丢了，允许保持原样或等定时任务补全
              }
            } catch {}
          }
        }
      }
      return data
    } catch (e) {
      log.w('[rocom] 读取活动缓存异常，准备回退:', e.message)
    }
  }
  return null
}