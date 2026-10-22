import { loadConfig, saveUserConfig } from '../components/config.js'

/** 嵌套配置 → 扁平表单字段 */
export function getConfigData() {
  const c = loadConfig()
  const s = c.subscribe || {}
  return {
    renderScale: c.renderScale,
    groupWhite: c.groupWhite,
    groupBlack: c.groupBlack,
    subscribeEnable: s.enable,
    subscribeGroups: s.groups,
    subscribeAtAll: s.atAll,
    subscribeKeywords: s.keywords,
    subscribeDelaySeconds: s.delaySeconds,
    subscribeRetry: s.retry,
    subscribeRetryIntervalSeconds: s.retryIntervalSeconds
  }
}

/** 扁平表单字段 → 嵌套配置 */
export function setConfigData(data) {
  const toArr = (v) =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : String(v || '').split(/[,，\s]+/).filter(Boolean)
  const toNum = (v, def) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : def
  }

  saveUserConfig({
    renderScale: toNum(data.renderScale, 100),
    groupWhite: toArr(data.groupWhite),
    groupBlack: toArr(data.groupBlack),
    subscribe: {
      enable: Boolean(data.subscribeEnable),
      groups: toArr(data.subscribeGroups),
      atAll: data.subscribeAtAll !== false,
      keywords: toArr(data.subscribeKeywords),
      delaySeconds: toNum(data.subscribeDelaySeconds, 120),
      retry: toNum(data.subscribeRetry, 5),
      retryIntervalSeconds: toNum(data.subscribeRetryIntervalSeconds, 30)
    }
  })
}
