import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { initConfigWatch } from './components/runtime.js'

initConfigWatch()

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
