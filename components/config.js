import fs from 'node:fs'
import YAML from 'yaml'
import { pluginDir } from './paths.js'

const configDir = pluginDir + 'config/'
const defaultPath = configDir + 'default_config.yaml'
const userPath = configDir + 'config.yaml'

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

/** 默认配置内联兜底，default_config.yaml 丢失时也能启动 */
const DEFAULT_CONFIG = {
  groupWhite: [],
  groupBlack: [],
  renderScale: 100,
  subscribe: {
    enable: false,
    atAll: true,
    groups: [],
    keywords: [],
    delaySeconds: 120,
    retry: 5,
    retryIntervalSeconds: 30
  }
}


const header = `# =======================================
# 本文件为 rocom-plugin 的用户配置
# 未在此定义的字段将采用 default_config.yaml 的默认值
# 修改后即时生效，无需重启
# =======================================
`

/** 缺文件时自动生成，用户不用手动创建 */
function ensureConfigFile(file, content) {
  if (fs.existsSync(file)) return
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(file, content, 'utf-8')
  logger.info(`[rocom] 已生成配置文件：${file}`)
}

function parseYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf-8')) || {}
  } catch (err) {
    logger.error(`[rocom] YAML 格式错误：${file}\n`, err.message)
    return {}
  }
}

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

/** 按字段类型修正，防止手写 yaml 写错类型 */
function normalize(conf) {
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

export function loadConfig() {
  ensureConfigFile(defaultPath, YAML.stringify(DEFAULT_CONFIG))
  ensureConfigFile(userPath, header)
  return normalize(merge(parseYaml(defaultPath), parseYaml(userPath)))
}

/** 发现用户配置被修改时热重载 */
export function watchConfig(onChange) {
  for (const file of [userPath, defaultPath]) {
    try {
      fs.watchFile(file, { interval: 2000 }, () => {
        try {
          onChange()
          logger.info('[rocom] 检测到配置变更，已重载')
        } catch (err) {
          logger.error('[rocom] 配置重载失败：', err)
        }
      })
    } catch {
      /* 监听失败不影响运行 */
    }
  }
}


/** 保存用户覆盖配置（仅写入与默认值不同的字段） */
export function saveUserConfig(partial) {
  ensureConfigFile(defaultPath, YAML.stringify(DEFAULT_CONFIG))
  const current = fs.existsSync(userPath) ? parseYaml(userPath) : {}
  const next = { ...current }

  const strip = (obj, def) => {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (isObj(v) && isObj(def?.[k])) {
        const sub = strip(v, def[k])
        if (Object.keys(sub).length) out[k] = sub
        continue
      }
      if (JSON.stringify(v) === JSON.stringify(def?.[k])) continue
      out[k] = v
    }
    return out
  }

  const merged = merge(next, partial)
  const diff = strip(merged, DEFAULT_CONFIG)
  const body = YAML.stringify(diff, { lineWidth: 0 })
  fs.writeFileSync(userPath, header + (body || ''), 'utf-8')
  return loadConfig()
}

export { defaultPath, userPath }