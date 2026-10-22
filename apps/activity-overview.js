import { BaseApp, log } from '../components/index.js'
import { getActivityOverview } from '../models/activity-overview.js'
import { renderActivityOverview } from '../render/activity-overview-renderer.js'

export class RocomActivityOverview extends BaseApp {
  constructor() {
    super({
      name: 'activity-overview',
      dsc: '洛克王国世界进行中与即将开启活动总览',
      priority: 5000,
      rule: [{ reg: '^#?活动$', fnc: 'overview' }]
    })
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
