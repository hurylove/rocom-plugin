import { BaseApp, log } from '../components/index.js'

/**
 * 走 Yunzai 标准更新器（plugins/other/update.js）。
 * 它靠 e.msg 里的「#更新<插件名>」解析目标，所以这里把 msg 改写成规范形式再转交，
 * 这样 #洛克更新 / #洛克强制更新 都能复用官方的 git pull、强制 reset、重启与失败提示。
 */
export class RocomUpdate extends BaseApp {
  constructor() {
    super({
      name: 'update',
      dsc: '更新 rocom-plugin',
      priority: 400,
      rule: [
        { reg: '^#?洛克(插件)?(强制)?更新$', fnc: 'update' },
        { reg: '^#?洛克(插件)?更新日志$', fnc: 'updateLog' }
      ]
    })
  }

  async updater(e, msg) {
    let Update
    try {
      ;({ update: Update } = await import('../../other/update.js'))
    } catch {
      await e.reply('未找到 Yunzai 更新器（plugins/other/update.js），请手动 git pull。')
      return false
    }
    const inst = new Update(e)
    inst.e = { ...e, msg }
    return inst
  }

  async update(e) {
    if (!e.isMaster) return e.reply('只有主人可以更新插件。')
    if (!(await this.checkGroup(e))) return false

    const force = /强制/.test(e.msg)
    log.i(`${force ? '强制更新' : '更新'} rocom-plugin`)
    const inst = await this.updater(e, `#${force ? '强制更新' : '更新'}rocom-plugin`)
    return inst ? inst.update() : false
  }

  async updateLog(e) {
    if (!e.isMaster) return e.reply('只有主人可以查看更新日志。')
    if (!(await this.checkGroup(e))) return false
    const inst = await this.updater(e, '#更新日志rocom-plugin')
    return inst ? inst.updateLog() : false
  }
}
