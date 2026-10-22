import { config } from './runtime.js'
import { slots } from '../models/merchant.js'
import { log } from './index.js'

let jobs = []

/**
 * 为四轮注册开轮提醒：每轮开始后 delaySeconds 秒执行一次
 * node-schedule 缺失时退化为自己的 setTimeout 计算（最多等 24h）
 */
export async function startSubscribeScheduler(task) {
  stopSubscribeScheduler()
  const s = config.subscribe
  if (!s.enable) {
    log.i('订阅未开启，定时任务不启动')
    return
  }
  const delay = Math.max(0, s.delaySeconds)

  let schedule = null
  try {
    schedule = (await import('node-schedule')).default
  } catch {
    log.w('未加载到 node-schedule，改用内置定时器')
  }

  for (const slot of slots) {
    const [h, m] = slot.start.split(':').map(Number)
    const mm = m + Math.floor(delay / 60)
    const hh = h + Math.floor(mm / 60)
    const cron = `${mm % 60} ${hh % 24} * * *`
    const label = `${slot.name} 开轮提醒`
    if (schedule) {
      const job = schedule.scheduleJob(cron, () => task().catch((e) => log.e(`${label}执行失败：`, e)))
      jobs.push(job)
      log.i(`${label} 已设置：${cron}`)
    }
  }

  if (!schedule) {
    // 退化路径：每 60 秒检查一次是否在期望窗口内
    const timer = setInterval(() => {
      const now = new Date()
      const slot = slots.find((x) => {
        const [sh, sm] = x.start.split(':').map(Number)
        const target = sh * 60 + sm + delay / 60
        const cur = now.getHours() * 60 + now.getMinutes()
        return Math.floor(cur) === Math.floor(target) && now.getSeconds() < 60
      })
      if (slot) task().catch((e) => log.e('订阅检查失败：', e))
    }, 60000)
    jobs.push({ cancel: () => clearInterval(timer) })
  }
}

export function stopSubscribeScheduler() {
  for (const job of jobs) {
    try {
      job?.cancel?.()
    } catch {
      /* ignore */
    }
  }
  jobs = []
}
