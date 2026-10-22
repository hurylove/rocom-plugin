import { loadConfig } from './config.js'

let cache = loadConfig()

/** 只读代理，热重载时替换 cache 即可 */
export const config = new Proxy({}, {
  get: (_, k) => cache[k],
  has: (_, k) => k in cache,
  ownKeys: () => Reflect.ownKeys(cache),
  getOwnPropertyDescriptor: (_, k) => Reflect.getOwnPropertyDescriptor(cache, k)
})

export const getBot = () => globalThis.Bot

export function reloadConfig() {
  cache = loadConfig()
  return cache
}

/** 群是否允许响应命令 */
export function isGroupAllowed(groupId) {
  const id = String(groupId)
  if (config.groupBlack.includes(id)) return false
  if (config.groupWhite.length && !config.groupWhite.includes(id)) return false
  return true
}
