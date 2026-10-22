import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { startSubscribeScheduler, stopSubscribeScheduler } from './components/scheduler.js'
import { runSubscribeCheck } from './apps/subscribe.js'

const appsDir = fileURLToPath(new URL('./apps/', import.meta.url))
const files = fs
  .readdirSync(appsDir)
  .filter((file) => file.endsWith('.js'))
  .sort()

let loaded = 0
for (const file of files) {
  try {
    await import(pathToFileURL(path.join(appsDir, file)).href)
    loaded++
  } catch (err) {
    logger.error(`[rocom] 载入 ${file} 失败：`, err)
  }
}

logger.info(`[rocom] 已载入 ${loaded}/${files.length} 个模块`)

// 远行商人开轮订阅提醒
startSubscribeScheduler(() => runSubscribeCheck(globalThis.Bot)).catch((err) =>
  logger.error('[rocom] 订阅定时任务启动失败：', err)
)

export function unload() {
  stopSubscribeScheduler()
  logger.info('[rocom] 插件已卸载')
}
