import { BaseApp, config, log } from '../components/index.js'
import { collectStatus, statusText } from '../models/status.js'
import { renderStatus } from '../render/status-renderer.js'

/** 主人专用维护命令：汇总插件版本、进程、缓存与订阅配置。 */
export class RocomStatus extends BaseApp {
  constructor() {
    super({
      name: 'status',
      dsc: '查看 rocom-plugin 运行状态（主人专用）',
      priority: 5000,
      rule: [{ reg: '^#?洛克(插件)?状态$', fnc: 'status' }]
    })
  }

  async status(e) {
    if (!e.isMaster) return e.reply('只有主人可以查看插件状态。')
    if (e.isGroup && !(await this.checkGroup(e))) return false
    const data = collectStatus({ config })
    let img = null
    try {
      img = await renderStatus(data)
    } catch (err) {
      log.w('状态图渲染失败，改用文字：', err?.message || err)
    }
    if (img) return e.reply(img)
    return e.reply(statusText(data))
  }
}
