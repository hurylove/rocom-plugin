const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 远程 JSON 快照体（形如 const XXX = {...};）→ 对象 */
export async function fetchSnapshot(url, { timeout = 15000 } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) })
  if (!res.ok) throw new Error(`请求失败 HTTP ${res.status}：${url}`)
  const text = await res.text()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error(`响应格式异常：${url}`)
  return JSON.parse(text.slice(start, end + 1))
}
