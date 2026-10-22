import { BaseApp, log } from '../components/index.js'
import { getActivityOverview } from '../models/activity-overview.js'
import { updateActivityData, getLocalActivityOverview } from '../models/activity-crawler.js'
import { renderActivityOverview } from '../render/activity-overview-renderer.js'

export class RocomActivityOverview extends BaseApp {
  constructor() {
    super({
      name: 'activity-overview',
      dsc: '洛克王国世界进行中与即将开启活动总览',
      priority: 5000,
      rule: [
        { reg: '^#?活动$', fnc: 'overview' },
        { reg: '^#?(更新|刷新)活动$', fnc: 'refresh', permission: 'master' }
      ],
      // 每天凌晨 01:00:00 自动抓取并下载活动图片到本地缓存
      task: [{ cron: '0 0 1 * * *', name: '活动档案缓存更新', log: false, fnc: () => this.sync() }]
    })

    // 启动时若尚无本地缓存，在后台异步拉取一次，不阻塞启动
    this.checkInitialSync()
  }

  async checkInitialSync() {
    try {
      const local = getLocalActivityOverview()
      if (!local || !local.active || local.active.length === 0) {
        log.i('[rocom] 未检测到活动本地缓存，正在首次拉取...')
        updateActivityData().catch((err) => log.e('[rocom] 首次拉取活动失败：', err))
      }
    } catch {}
  }

  async sync() {
    log.i('[rocom] 触发每日凌晨活动档案更新...')
    await updateActivityData()
  }

  async refresh(e) {
    if (!(await this.checkGroup(e))) return false
    await e.reply('正在从 Wiki 抓取最新活动并缓存图片至本地，请稍候...')
    const data = await updateActivityData()
    if (data) {
      return e.reply(`活动档案更新成功！当前进行中 ${data.totalActive} 个，即将开启 ${data.totalUpcoming} 个。可在群内发送 #活动 查看。`)
    } else {
      return e.reply('活动档案更新失败，请查看后台日志。')
    }
  }

  async overview(e) {
    if (!(await this.checkGroup(e))) return false
    const activity = getActivityOverview()
    log.i(`正在渲染活动总览：进行中 ${activity.totalActive} 个、近期开启 ${activity.totalUpcoming} 个`)
    const img = await renderActivityOverview(activity)
    if (img) return e.reply(img)

    log.w('活动总览渲染失败，退回文字')
    return e.reply(this.textFallback(activity))
  }

  textFallback(activity) {
    const lines = [
      `进行中（显示 ${activity.active.length} / ${activity.totalActive}）：`,
      ...activity.active.map((item) => `· ${item.title} · ${item.start} — ${item.end}`),
      `即将开启（显示 ${activity.upcoming.length} / ${activity.totalUpcoming}）：`,
      ...activity.upcoming.map((item) => `· ${item.title} · ${item.start} 开启`)
    ]
    return lines.join('\n')
  }
}
