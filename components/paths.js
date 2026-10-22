import { fileURLToPath } from 'node:url'

const pluginRoot = fileURLToPath(new URL('../', import.meta.url))

export const pluginDir = pluginRoot
export const templateDir = pluginRoot + 'resources/'
export const dataDir = pluginRoot + 'data/'
