import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initConfigWatch } from './components/runtime.js'

// 配置热重载，随插件首次加载时启动一次
initConfigWatch()

const appsDir = fileURLToPath(new URL('./apps/', import.meta.url))

/**
 * Yunzai 加载器对 index.js 的处理：
 *   const module = await import(file.path)
 *   const app = module.apps ? { ...module.apps } : module
 * 因此必须把插件类汇总到 module.apps，否则它们不会被注册。
 */
export const apps = {}

for (const file of fs.readdirSync(appsDir).filter((f) => f.endsWith('.js')).sort()) {
  try {
    const mod = await import(pathToFileURL(path.join(appsDir, file)).href)
    let count = 0
    for (const [key, klass] of Object.entries(mod)) {
      if (typeof klass !== 'function') continue
      apps[key] = klass
      count++
    }
    logger.info(`[rocom] 载入 ${file}：${count} 个模块`)
  } catch (err) {
    logger.error(`[rocom] 载入 ${file} 失败：`, err)
  }
}

logger.info(`[rocom] 已注册 ${Object.keys(apps).length} 个插件类：${Object.keys(apps).join('、')}`)
