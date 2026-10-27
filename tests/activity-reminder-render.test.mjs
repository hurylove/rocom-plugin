import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('../', import.meta.url))
const templateDir = path.join(root, 'resources') + path.sep
const source = (filename) => fs.readFileSync(path.join(root, filename), 'utf8')
const stripExports = (value) => value.replace(/^export (?=(?:async )?function)/gm, '')
const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-reminder-ui-'))
const coverFile = path.join(fixtureDir, 'cached-cover.png')
fs.writeFileSync(coverFile, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=', 'base64'))
process.on('exit', () => fs.rmSync(fixtureDir, { recursive: true, force: true }))

function rendererWith(screenshot) {
  const errors = []
  const body = stripExports(source('render/activity-reminder-renderer.js').replace(/^import .*$/gm, ''))
  const render = new Function('fs', 'path', 'fileURLToPath', 'pathToFileURL', 'Puppeteer', 'templateDir', 'config', 'log', body + '\nreturn renderActivityReminder')(
    fs, path, fileURLToPath, pathToFileURL, { screenshot }, templateDir, { renderScale: 200 }, { e: (...args) => errors.push(args) }
  )
  return { render, errors }
}

const item = (overrides = {}) => ({
  id: 'activity-1', title: '春日同行', category: '限时活动', rewards: '国王球 × 3、成长果实',
  end: '2026-05-20 18:00', endAt: '2026-05-20T10:00:00.000Z', leftText: '23小时59分钟', hoursBefore: 24,
  cover: pathToFileURL(coverFile).href, ...overrides
})
const data = (items = [item()]) => ({ nowText: '2026-05-19 18:01', updatedAt: '2026-05-19 01:00', items })
const clone = (value) => structuredClone(value)

function handlerWith(initial = {}) {
  let current = clone(initial)
  const saves = []
  const merge = (base, partial) => {
    const out = { ...base }
    for (const [key, value] of Object.entries(partial)) {
      out[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge(base[key] || {}, value) : clone(value)
    }
    return out
  }
  const body = stripExports(source('guoba/config-handler.js').replace(/^import .*$/gm, ''))
  const handler = new Function('loadConfig', 'saveUserConfig', body + '\nreturn { getConfigData, setConfigData }')(
    () => clone(current), (partial) => { saves.push(clone(partial)); current = merge(current, partial) }
  )
  return { ...handler, saves, current: () => clone(current) }
}

const existing = () => ({
  renderScale: 200, groupWhite: ['101'], groupBlack: ['202'],
  subscribe: { enable: true, groups: ['303'], atAll: false, keywords: ['国王球'], delaySeconds: 45, retry: 8, retryIntervalSeconds: 25, internal: { keep: true } },
  activityReminder: { enable: true, groups: ['404'], atAllGroups: ['404', '505'], hoursBefore: [24, 6], cacheMaxAgeHours: 48, botRoutes: { '404': 'bot-1' }, internal: { retain: [1, 2] } },
  unrelated: { preserve: true }
})

let template
let puppeteer
let dependencyError = ''
const dependencyRoot = process.env.ROCOM_UI_DEPS_ROOT || root
try {
  const require = createRequire(path.join(dependencyRoot, 'package.json'))
  template = require('art-template')
  try { puppeteer = require('puppeteer') } catch (err) { dependencyError = err.message }
} catch (err) {
  dependencyError = err.message
}

async function renderPayload(input = data()) {
  let payload
  const { render } = rendererWith(async (_name, value) => { payload = value; return 'image-segment' })
  assert.equal(await render(input), 'image-segment')
  return payload
}

function compile(payload) {
  return template.compile(source('resources/activity-reminder.html'), { filename: path.join(templateDir, 'activity-reminder.html') })(payload)
}

function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length }
}

test('renderer keeps PNG, scale 200 and absolute local font URL without mutating input', async () => {
  const input = data()
  const before = clone(input)
  const payload = await renderPayload(input)
  assert.equal(payload.imgType, 'png')
  assert.equal(payload.renderScale, 2)
  assert.equal(payload.saveId, 'activity-reminder')
  assert.equal(payload.tplFile, path.join(templateDir, 'activity-reminder.html'))
  assert.equal(payload.fontUrl, pathToFileURL(path.join(templateDir, 'font', 'AlimamaFangYuanTiVF.ttf')).href)
  assert.equal(payload.reminder.items[0].cover, pathToFileURL(coverFile).href)
  assert.deepEqual(input, before)
})

test('renderer preserves every item and full long/hostile text', async () => {
  const hostile = '<script>globalThis.pwned=1</script><img src="https://example.invalid/leak" onerror="alert(1)">&'
  const long = '很长的活动名称与奖励'.repeat(160)
  const items = Array.from({ length: 31 }, (_, index) => item({ id: String(index), title: index === 0 ? hostile : long + index, rewards: long }))
  const payload = await renderPayload(data(items))
  assert.equal(payload.reminder.items.length, 31)
  assert.equal(payload.reminder.items[0].title, hostile)
  assert.equal(payload.reminder.items[30].title, long + '30')
  assert.equal(payload.reminder.items[30].rewards, long)
})

test('only existing absolute local image paths are accepted; URLs and missing covers become placeholders', async () => {
  const bad = ['', 'https://example.invalid/a.png', 'http://example.invalid/a.png', '//example.invalid/a.png', 'file://remote-host/cover.png', 'data:image/png;base64,abc', 'javascript:alert(1)', 'resources/cover.png', path.join(fixtureDir, 'missing.png'), fixtureDir, path.join(root, 'README.md'), '\\\\remote-host\\cover.png']
  const payload = await renderPayload(data([item({ cover: coverFile }), ...bad.map((cover) => item({ cover }))]))
  assert.equal(payload.reminder.items[0].cover, pathToFileURL(coverFile).href)
  assert.ok(payload.reminder.items.slice(1).every((entry) => entry.cover === ''))
})

test('invalid contract or screenshot/template failure returns null', async () => {
  let calls = 0
  const { render, errors } = rendererWith(async () => { calls++; throw new Error('template compilation failed') })
  for (const input of [null, {}, { items: [] }, data([null]), data([item({ title: '' })]), data([item({ hoursBefore: 0 })]), data([item({ hoursBefore: 'NaN' })])]) {
    assert.equal(await render(input), null)
  }
  assert.equal(calls, 0)
  assert.equal(await render(data()), null)
  assert.equal(calls, 1)
  assert.equal(errors.length, 8)
  for (const result of [null, false, undefined]) {
    assert.equal(await rendererWith(async () => result).render(data()), null)
  }
})

test('panel getters have reliable reminder and merchant defaults', () => {
  const h = handlerWith()
  assert.deepEqual(h.getConfigData(), {
    renderScale: 200, groupWhite: [], groupBlack: [], subscribeEnable: false, subscribeGroups: [], subscribeAtAll: true,
    subscribeKeywords: [], subscribeDelaySeconds: 120, subscribeRetry: 5, subscribeRetryIntervalSeconds: 30,
    activityReminderEnable: true, activityReminderGroups: [], activityReminderAtAllGroups: [], activityReminderHoursBefore: [24, 6], activityReminderCacheMaxAgeHours: 48
  })
  const malformed = handlerWith({ subscribe: null, activityReminder: { enable: null, groups: null, hoursBefore: [0, -1, 'x', 169], cacheMaxAgeHours: Infinity } }).getConfigData()
  assert.equal(malformed.activityReminderEnable, true)
  assert.deepEqual(malformed.activityReminderGroups, [])
  assert.deepEqual(malformed.activityReminderHoursBefore, [24, 6])
  assert.equal(malformed.activityReminderCacheMaxAgeHours, 48)
})

test('empty/undefined/unrelated panel submission never saves or resets anything', () => {
  const initial = existing()
  const h = handlerWith(initial)
  for (const input of [undefined, null, {}, [], { arbitrary: true }, { subscribeEnable: undefined, activityReminderGroups: undefined }]) h.setConfigData(input)
  assert.equal(h.saves.length, 0)
  assert.deepEqual(h.current(), initial)
})

test('partial reminder save preserves merchant, groups, other reminders and internal bot routes', () => {
  const initial = existing()
  const h = handlerWith(initial)
  h.setConfigData({ activityReminderEnable: false })
  assert.deepEqual(Object.keys(h.saves[0]), ['activityReminder'])
  assert.deepEqual(h.current(), { ...initial, activityReminder: { ...initial.activityReminder, enable: false } })
  h.setConfigData({ activityReminderHoursBefore: '6,24，6 1.5 168 169 0 -2 Infinity x', activityReminderCacheMaxAgeHours: '169' })
  assert.deepEqual(h.current().activityReminder.hoursBefore, [168, 24, 6, 1.5])
  assert.equal(h.current().activityReminder.cacheMaxAgeHours, 48)
  assert.deepEqual(h.current().activityReminder.botRoutes, initial.activityReminder.botRoutes)
  assert.deepEqual(h.current().subscribe, initial.subscribe)
  assert.deepEqual(h.current().groupWhite, initial.groupWhite)
  assert.deepEqual(h.current().groupBlack, initial.groupBlack)
})

test('get/set round-trip preserves all existing sections and hidden configuration', () => {
  const initial = existing()
  const h = handlerWith(initial)
  h.setConfigData(h.getConfigData())
  assert.deepEqual(h.current(), initial)
  h.setConfigData({ renderScale: 150 })
  assert.deepEqual(h.current(), { ...initial, renderScale: 150 })
  h.setConfigData({ subscribeKeywords: [' 粉尘 ', '粉尘', ''] })
  assert.deepEqual(h.current().subscribe, { ...initial.subscribe, keywords: ['粉尘'] })
  assert.deepEqual(h.current().activityReminder, initial.activityReminder)
})

test('panel accepts arrays and delimited groups; @all does not subscribe; empty list clears explicitly', () => {
  const initial = existing()
  const h = handlerWith(initial)
  h.setConfigData({ activityReminderAtAllGroups: [606, ' 606 ', '', null, '707'] })
  assert.deepEqual(h.current().activityReminder.atAllGroups, ['606', '707'])
  assert.deepEqual(h.current().activityReminder.groups, ['404'])
  h.setConfigData({ activityReminderGroups: '808,909，808 1010' })
  assert.deepEqual(h.current().activityReminder.groups, ['808', '909', '1010'])
  h.setConfigData({ activityReminderGroups: [], activityReminderHoursBefore: [], activityReminderCacheMaxAgeHours: -1, subscribeEnable: 'false' })
  assert.deepEqual(h.current().activityReminder.groups, [])
  assert.deepEqual(h.current().activityReminder.hoursBefore, [24, 6])
  assert.equal(h.current().activityReminder.cacheMaxAgeHours, 48)
  assert.equal(h.current().subscribe.enable, false)
})

test('reminder schema uses only existing components and exposes exactly the shared fields', async () => {
  const { default: previous } = await import('../guoba/schemas/tab-subscribe.js')
  const { default: reminder } = await import('../guoba/schemas/tab-activity-reminder.js')
  const { default: schemas } = await import('../guoba/schemas/schema.js')
  const allowed = new Set(previous.map((entry) => entry.component))
  assert.ok(reminder.every((entry) => allowed.has(entry.component)))
  assert.deepEqual(reminder.filter((entry) => entry.field).map((entry) => entry.field), [
    'activityReminderEnable', 'activityReminderGroups', 'activityReminderAtAllGroups', 'activityReminderHoursBefore', 'activityReminderCacheMaxAgeHours'
  ])
  assert.ok(schemas.some((entry) => entry.field === 'subscribeGroups'))
  assert.ok(schemas.some((entry) => entry.field === 'activityReminderGroups'))
})

test('help preserves existing sections and adds skills; command cards remain separate from notes', async () => {
  const { parseHelp } = await import('../components/help.js')
  const markdown = source('resources/help/help.md')
  const groups = parseHelp(markdown)
  assert.equal(groups.length, 11)
  assert.ok(groups.some((entry) => entry.group === '精灵图鉴'))
  assert.ok(groups.length <= 12)
  const reminder = groups.find((entry) => entry.group === '活动到期提醒')
  assert.equal(reminder.list.length, 5)
  assert.equal(reminder.notes.length, 6)
  const commands = reminder.list.flatMap((entry) => entry.titles)
  for (const command of ['#活动提醒开启', '#活动提醒关闭', '#活动提醒状态', '#活动提醒列表', '#活动提醒@全体开启', '#活动提醒@全体关闭']) {
    assert.ok(commands.includes(command))
    assert.ok(source('README.md').includes(command))
  }
  assert.ok(reminder.list.find((entry) => entry.titles.includes('#活动提醒状态')).desc.includes('群成员可查'))
  assert.ok(reminder.list.filter((entry) => !entry.titles.includes('#活动提醒状态')).every((entry) => entry.desc.includes('主人或本群管理员')))
  const notes = reminder.notes.join(' ')
  for (const expected of ['默认不订阅', '全天每分钟', '24h', '6h', '48h', '静默', '已结束不补', '失败可重试', '@全体名单不自动订阅']) assert.ok(notes.includes(expected), expected)
  for (const title of ['远行商人', '开轮订阅提醒', '活动总览', '插件维护', '关于']) assert.ok(groups.some((entry) => entry.group === title))
  assert.ok(source('README.md').includes('不得覆盖'))
  assert.ok(source('README.md').includes('data/activity_cache.json'))
})

test('template compiles 1/many/missing/hostile/long items with escaped HTML and no truncation', { skip: !template && 'art-template unavailable; use ROCOM_UI_DEPS_ROOT with existing Yunzai dependencies' }, async () => {
  assert.ok(template, dependencyError)
  const hostile = '<script>globalThis.pwned=1</script><img src="https://example.invalid/leak" onerror="alert(1)">&'
  const long = 'LongUnbrokenText'.repeat(120) + '活动奖励'.repeat(100)
  for (const items of [[item()], Array.from({ length: 25 }, (_, index) => item({ id: String(index), title: '活动-' + index, cover: '' })), [item({ title: hostile, category: hostile, rewards: long, end: hostile, leftText: hostile, cover: 'https://example.invalid/a.png' })]]) {
    const html = compile(await renderPayload(data(items)))
    assert.equal((html.match(/<article class="activity">/g) || []).length, items.length)
    if (items[0].title === hostile) assert.match(html, /(?:&lt;|&#60;)script(?:&gt;|&#62;)/)
    else assert.ok(html.includes(items.length > 1 ? '活动-24' : '春日同行'))
    assert.ok(!html.includes('<script>'))
    assert.ok(!html.includes('<img src="https://'))
    if (items[0].title === hostile) assert.ok(html.includes(long))
    assert.equal((html.match(/<footer class="footer">rocom-plugin<\/footer>/g) || []).length, 1)
    assert.ok(!html.includes('数据源'))
    assert.ok(!html.includes('筛选条件'))
  }
})

test('real browser validates PNG, local images, cream/gold/orange computed style and nonoverflowing long/all items', { skip: process.env.ROCOM_UI_BROWSER !== '1' && 'set ROCOM_UI_BROWSER=1 to enable an offline browser check', timeout: 120000 }, async (t) => {
  assert.ok(template, dependencyError)
  assert.ok(puppeteer, dependencyError)
  const output = process.env.ROCOM_UI_OUTPUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'rocom-reminder-browser-'))
  fs.mkdirSync(output, { recursive: true })
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.ROCOM_UI_CHROME || await puppeteer.executablePath(), args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files', '--disable-dev-shm-usage'] })
  try {
    const cases = [
      ['single', [item()]],
      ['multiple', Array.from({ length: 25 }, (_, index) => item({ id: String(index), title: '合并活动-' + index, hoursBefore: index % 2 ? 6 : 24, leftText: index % 2 ? '5小时59分钟' : '23小时59分钟', cover: index % 2 ? '' : coverFile }))],
      ['hostile-long', [item({ title: '<script>globalThis.pwned=1</script>' + '超长活动名称'.repeat(65), category: '<img src="https://example.invalid/" onerror="alert(1)">', rewards: 'LongUnbrokenReward'.repeat(100) + '长奖励'.repeat(120), end: '2026-05-20 18:00', leftText: '剩余时间文本'.repeat(80), cover: 'https://example.invalid/a.png' })]]
    ]
    for (const [name, items] of cases) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
      const forbiddenRequests = []
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        if (/^https?:/i.test(request.url())) { forbiddenRequests.push(request.url()); request.abort() } else request.continue()
      })
      const filename = path.join(output, name + '.html')
      fs.writeFileSync(filename, compile(await renderPayload(data(items))))
      await page.goto(pathToFileURL(filename).href, { waitUntil: 'networkidle0' })
      await page.evaluate(async () => {
        await document.fonts.ready
        await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})))
      })
      const dom = await page.evaluate(() => {
        const body = document.body
        const cards = [...document.querySelectorAll('.activity')]
        const overflow = [...document.querySelectorAll('.content, .tag, .name, .detail, .clock')].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => ({ className: element.className, scroll: element.scrollWidth, client: element.clientWidth }))
        const styles = (selector) => { const style = getComputedStyle(document.querySelector(selector)); return { background: style.backgroundColor, color: style.color, whiteSpace: style.whiteSpace, overflow: style.overflow, textOverflow: style.textOverflow } }
        return {
          count: cards.length, width: body.getBoundingClientRect().width, height: body.getBoundingClientRect().height,
          titles: cards.map((entry) => entry.querySelector('.name').textContent), rewards: cards.map((entry) => entry.querySelector('.reward').textContent),
          overflow, imageCount: document.images.length, imagesLoaded: [...document.images].every((image) => image.complete && image.naturalWidth > 0),
          placeholders: document.querySelectorAll('.placeholder').length, body: styles('body'), title: styles('h1'), card: styles('.activity'), category: styles('.category'), stage: styles('.stage'), name: styles('.name'),
          footer: document.querySelector('.footer').textContent, pwned: globalThis.pwned || null, scriptCount: document.scripts.length,
          lastBottom: cards.at(-1).getBoundingClientRect().bottom, footerBottom: document.querySelector('.footer').getBoundingClientRect().bottom
        }
      })
      assert.equal(dom.count, items.length)
      assert.equal(dom.width, 1520)
      assert.deepEqual(dom.overflow, [])
      assert.ok(dom.imagesLoaded)
      assert.equal(dom.imageCount, items.filter((entry) => entry.cover === coverFile || entry.cover === pathToFileURL(coverFile).href).length)
      assert.equal(dom.body.background, 'rgb(239, 232, 218)')
      assert.equal(dom.card.background, 'rgb(251, 247, 239)')
      assert.equal(dom.title.color, 'rgb(122, 90, 32)')
      assert.equal(dom.category.color, 'rgb(122, 90, 32)')
      assert.equal(dom.stage.background, 'rgb(248, 216, 177)')
      assert.equal(dom.name.whiteSpace, 'pre-wrap')
      assert.equal(dom.name.textOverflow, 'clip')
      assert.equal(dom.footer, 'rocom-plugin')
      assert.equal(dom.pwned, null)
      assert.equal(dom.scriptCount, 0)
      assert.deepEqual(forbiddenRequests, [])
      assert.ok(dom.lastBottom < dom.footerBottom && dom.footerBottom <= dom.height)
      assert.deepEqual(dom.titles, items.map((entry) => entry.title))
      assert.deepEqual(dom.rewards, items.map((entry) => '奖励：' + entry.rewards))
      const body = await page.$('body')
      const image = Buffer.from(await body.screenshot({ type: 'png', path: path.join(output, name + '.png') }))
      const size = pngSize(image)
      assert.equal(size.width, 1520)
      assert.ok(size.height >= Math.floor(dom.height) - 1)
      const evidence = { name, png: size, dom: { ...dom, titles: dom.titles.map((entry) => entry.length), rewards: dom.rewards.map((entry) => entry.length) }, forbiddenRequests }
      fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(evidence, null, 2))
      t.diagnostic(JSON.stringify({ name, output, png: size, count: dom.count, loadedLocalImages: dom.imageCount, placeholders: dom.placeholders, overflow: dom.overflow, colors: { body: dom.body.background, card: dom.card.background, title: dom.title.color, stage: dom.stage.background } }))
      await page.close()
    }
  } finally {
    await browser.close()
  }
})
