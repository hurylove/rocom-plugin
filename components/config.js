import fs from 'node:fs'
import YAML from 'yaml'
import { pluginDir } from './paths.js'

const defaultPath = pluginDir + 'config/default_config.yaml'
const userPath = pluginDir + 'config/config.yaml'

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** 深合并，用户配置优先 */
function merge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const key of Object.keys(over)) {
    const b = base[key]
    const o = over[key]
    out[key] = isObj(b) && isObj(o) ? merge(b, o) : o
  }
  return out
}

function readYaml(file) {
  if (!fs.existsSync(file)) return {}
  try {
    return YAML.parse(fs.readFileSync(file, 'utf-8')) || {}
  } catch (err) {
    logger.error(`[rocom] 配置解析失败：${file}`, err)
    return {}
  }
}

export function loadConfig() {
  const conf = merge(readYaml(defaultPath), readYaml(userPath))
  conf.groupWhite = Array.isArray(conf.groupWhite) ? conf.groupWhite.map(String) : []
  conf.groupBlack = Array.isArray(conf.groupBlack) ? conf.groupBlack.map(String) : []
  conf.renderScale = Number(conf.renderScale) || 100

  const s = conf.subscribe || (conf.subscribe = {})
  s.enable = Boolean(s.enable)
  s.atAll = s.atAll !== false
  s.groups = Array.isArray(s.groups) ? s.groups.map(String).filter(Boolean) : []
  s.keywords = Array.isArray(s.keywords) ? s.keywords.map((k) => String(k).trim()).filter(Boolean) : []
  s.delaySeconds = Number.isFinite(Number(s.delaySeconds)) ? Number(s.delaySeconds) : 120
  s.retry = Number(s.retry) > 0 ? Number(s.retry) : 5
  s.retryIntervalSeconds = Number(s.retryIntervalSeconds) > 0 ? Number(s.retryIntervalSeconds) : 30
  return conf
}

export { defaultPath, userPath }
