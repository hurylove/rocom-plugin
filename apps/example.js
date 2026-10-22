import { BaseApp, log } from '../components/index.js'
import { helpData } from '../components/help.js'
import { renderHelp } from '../render/help-renderer.js'

export class RocomHelp extends BaseApp {
  constructor() {
    super({
      name: 'help',
      dsc: '洛克王国世界插件帮助',
      priority: 4999,
      rule: [{ reg: '^#?洛克(帮助|菜单)$', fnc: 'help' }]
    })
  }

  async help(e) {
    if (!(await this.checkGroup(e))) return false
    const img = await renderHelp()
    if (img) return e.reply(img)

    log.w('帮助图渲染失败，退回文字')
    const lines = []
    for (const sec of helpData().sections) {
      lines.push(`【${sec.title}】`)
      for (const item of sec.items) lines.push('· ' + item.replace(/<[^>]+>/g, ''))
    }
    return e.reply(lines.join('\n'))
  }
}
