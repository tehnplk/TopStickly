import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { dockTop, undock, setRect, barScreen, setBarDisplay, leftButtonDown } from './appbar.js'
import { loadDbConfig, saveDbConfig, testDb, getPatient } from './db.js'
import { GROUPS, checkRules, checkPendingDrug, rulesOff, setRuleOn } from './rules.js'
import { readHn, readDrugBox, watchClicks } from './hosxp.js'
import updater from 'electron-updater' // CommonJS package: named ESM imports aren't available
const { autoUpdater } = updater

const BAR_HEIGHT = 30
const COLLAPSED_WIDTH = 120
const COLLAPSED_HEIGHT = 6
const COLLAPSED_OPACITY = 0.3 // 70% transparent
const HOVER_OPACITY = 0.5
const ANIM_MS = 200
const SETTINGS_WIDTH = 520
const HN_POLL_MS = 1000

const UPDATE_CHECK_MS = 4 * 60 * 60 * 1000 // the bar runs all day: check GitHub Releases periodically

let tray // module-level: a Tray that goes out of scope gets garbage-collected and vanishes

// Silent install, then relaunch the app.
const installUpdate = () => autoUpdater.quitAndInstall(true, true)

// Tray menu; once an update is downloaded it offers to install it (never forced mid-work).
function setTrayMenu(updateVersion) {
  const items = [{ label: 'Quit', click: () => app.quit() }]
  if (updateVersion) items.unshift({ label: `อัปเดตเป็น v${updateVersion} แล้วเปิดใหม่`, click: installUpdate }, { type: 'separator' })
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

// Installed builds only: download updates from GitHub Releases in the background; they install on the
// next quit anyway, or right away from the bar's update button / the tray menu.
function startAutoUpdate(onDownloaded) {
  if (!app.isPackaged) return
  autoUpdater.on('update-downloaded', ({ version }) => {
    setTrayMenu(version)
    onDownloaded(version)
  })
  autoUpdater.on('error', (e) => console.error('auto update', e.message))
  const check = () => autoUpdater.checkForUpdates().catch(() => {}) // offline etc.: try again next round
  check()
  setInterval(check, UPDATE_CHECK_MS)
}

// One bar only: a second launch quits at once (the first keeps running).
if (!app.requestSingleInstanceLock()) app.exit()

app.whenReady().then(() => {
  tray = new Tray(path.join(import.meta.dirname, 'tray.png'))
  tray.setToolTip(`TopStickly v${app.getVersion()}`)
  setTrayMenu()

  const win = new BrowserWindow({
    height: BAR_HEIGHT,
    frame: false,
    roundedCorners: false, // Windows 11 rounds frameless windows by default
    thickFrame: false, // no invisible resize border around the bar
    backgroundColor: '#21252B',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs') },
  })

  let target // current bar rect in physical pixels; the animation moves it frame by frame
  // Chromium pushes its windows into the work area whenever it changes; keep the bar where we want it.
  const pin = () => setRect(win, target)
  win.on('show', pin)
  // Full width of whatever display the bar is on: re-dock when its size/scale changes or displays come
  // and go (an unplugged display falls back to the primary). A work-area change alone (our own dock
  // fires one) only re-pins, or it would loop.
  const redock = () => {
    if (collapsed) return
    undock(win)
    target = dockTop(win, BAR_HEIGHT)
    pin()
  }
  const onMetrics = (_e, _d, changed) => (changed.some((m) => m === 'bounds' || m === 'scaleFactor') ? redock() : pin())
  screen.on('display-metrics-changed', onMetrics)
  screen.on('display-added', redock)
  screen.on('display-removed', redock)

  let timer
  function animate(to, opacity, done) {
    clearInterval(timer)
    const from = target, o0 = win.getOpacity(), t0 = Date.now()
    timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / ANIM_MS)
      const e = 1 - (1 - p) ** 3 // ease-out cubic
      target = Object.fromEntries(['x', 'y', 'width', 'height'].map((k) => [k, Math.round(from[k] + (to[k] - from[k]) * e)]))
      pin()
      win.setOpacity(o0 + (opacity - o0) * e)
      if (p === 1) {
        clearInterval(timer)
        timer = null
        done?.()
      }
    }, 16)
  }

  let collapsed = false
  function expand() {
    collapsed = false
    animate(dockTop(win, BAR_HEIGHT), 1)
  }
  function collapse() {
    collapsed = true
    const { x, y, width, scale } = barScreen()
    const w = Math.round(COLLAPSED_WIDTH * scale)
    const to = { x: x + Math.round((width - w) / 2), y, width: w, height: Math.round(COLLAPSED_HEIGHT * scale) }
    animate(to, COLLAPSED_OPACITY, () => undock(win)) // give the strip back to other apps once shrunk
  }

  ipcMain.on('set-collapsed', (_e, c) => (c ? collapse() : expand()))
  ipcMain.on('hover', (_e, over) => {
    // skip mid-animation so the collapse's undock callback isn't cancelled
    if (collapsed && !timer) animate({ ...target }, over ? HOVER_OPACITY : COLLAPSED_OPACITY)
  })
  // Which display the bar sits on: the user drags it there (grip = the icon), remembered across runs.
  const barFile = path.join(app.getPath('userData'), 'bar.json')
  try {
    setBarDisplay(JSON.parse(fs.readFileSync(barFile, 'utf8')).display)
  } catch {} // first run: primary display
  let dragTimer
  const saveDisplay = () => fs.writeFileSync(barFile, JSON.stringify({ display: barScreen().id }))
  ipcMain.on('drag', (_e, dragging) => {
    clearInterval(dragTimer)
    if (!dragging) return
    // while the button is held, follow the cursor: re-dock on whichever display it is over.
    // Stops by itself once the button is up, even if the page never reports the release.
    dragTimer = setInterval(() => {
      if (!leftButtonDown()) return clearInterval(dragTimer)
      const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      if (collapsed || d.id === barScreen().id) return
      setBarDisplay(d.id)
      redock()
      saveDisplay()
    }, 50)
  })

  target = dockTop(win, BAR_HEIGHT)
  pin()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    clearInterval(timer)
    clearInterval(dragTimer)
    // undock fires these after the window is gone
    screen.off('display-metrics-changed', onMetrics)
    screen.off('display-added', redock)
    screen.off('display-removed', redock)
    undock(win)
  })

  win.on('closed', () => app.quit()) // the bar is the app; take the settings window down with it

  // ponytail: 1s polling of HOSxP's HN box; switch to SetWinEventHook(EVENT_OBJECT_VALUECHANGE) if lag matters
  let patient = { hn: '' }
  // Rule hits for the current patient: group → [{ id, name, rows }]. Rules: electron/rules.js.
  // The warning itself is a modal: RDU pops up when a rule is hit, RLU when the flagged lab is ticked.
  const noAlerts = () => Object.fromEntries(Object.keys(GROUPS).map((g) => [g, []]))
  let alerts = noAlerts()
  let shown = new Set() // RDU rule ids already popped up for this patient
  const sendPatient = () => win.webContents.send('patient', patient)
  // badge = rules this patient meets, per group (checkRules already skips rules switched off)
  const sendAlerts = () => {
    const off = new Set(rulesOff())
    const count = Object.fromEntries(Object.entries(GROUPS).map(([g, { rules }]) => [g, { hits: alerts[g].length, on: rules.filter((r) => !off.has(r.id)).length }]))
    win.webContents.send('alerts', count)
  }
  // Re-read the latest visit and run the rules; pop up RDU rules hit for the first time.
  async function recheck() {
    const hn = patient.hn
    if (!hn) return
    const info = await getPatient(hn)
    if (patient.hn !== hn) return // HN changed while we were querying
    patient = { hn, ...info }
    sendPatient()
    const hits = await checkRules({ hn, vn: info.vn })
    if (patient.hn !== hn) return
    alerts = hits
    sendAlerts()
    const fresh = alerts.rdu.filter((h) => !shown.has(h.id))
    fresh.forEach((h) => shown.add(h.id))
    if (fresh.length) openWarning(fresh.map((h) => ({ group: 'rdu', rule: h.name, rows: h.rows })))
  }
  // A drug picked in HOSxP's drug-name box (not saved yet): warn right away if ordering it would trip an
  // RDU rule for this visit. Every time the box changes to such a drug (cleared and re-entered = warn
  // again); the rule then counts as shown, so the post-save recheck doesn't repeat it.
  let drugText = ''
  async function checkDrugBox() {
    const t = readDrugBox()
    if (t === null || t === drugText) return
    drugText = t
    const { hn, vn } = patient
    if (!hn || !vn || !t.trim()) return
    const hits = await checkPendingDrug({ hn, vn }, t)
    if (patient.hn !== hn || drugText !== t) return // moved on while we were querying
    hits.forEach((h) => shown.add(h.id))
    if (hits.length) openWarning(hits.map((h) => ({ group: 'rdu', rule: h.name, rows: h.rows })))
  }
  const hnTimer = setInterval(() => {
    checkDrugBox()
    const hn = readHn()
    if (hn === null || hn === patient.hn) return
    patient = { hn }
    alerts = noAlerts()
    shown = new Set()
    drugText = ''
    sendPatient() // show the HN right away, name + last visit follow
    sendAlerts()
    recheck()
  }, HN_POLL_MS)
  // Drugs get ordered while the patient is open: re-check shortly after the user stops clicking in HOSxP.
  // ponytail: up to ~23 small queries per check; move to a timer or SetWinEventHook if the DB feels it
  let recheckTimer
  const recheckSoon = () => {
    clearTimeout(recheckTimer)
    recheckTimer = setTimeout(recheck, 1500)
  }
  let updateVersion = '' // downloaded and ready to install
  win.webContents.on('did-finish-load', () => {
    sendPatient()
    sendAlerts()
    win.webContents.send('update', updateVersion)
  })
  startAutoUpdate((v) => win.webContents.send('update', (updateVersion = v)))
  ipcMain.on('install-update', installUpdate)
  const unhookClicks = watchClicks((click) => {
    recheckSoon()
    // Ticking a lab checkbox, or picking a lab in a combobox: warn if an RLU rule already flagged that lab
    // for this patient. checked === null (state unreadable) still warns: a needless warning beats a missed one.
    const picksLab = (click.action === 'check' && click.checked !== false) || click.action === 'select'
    if (!picksLab || !click.caption) return
    const lab = click.caption.replace(/\s*\?\s*$/, '').trim() // HOSxP captions = lab_items_name + optional " ?"
    // rows are newest first: keep the latest order per rule
    const found = alerts.rlu.flatMap((h) => {
      const rows = h.rows.filter((r) => r.lab === lab).slice(0, 1)
      return rows.length ? [{ group: 'rlu', rule: h.name, rows }] : []
    })
    if (found.length) openWarning(found)
  })
  win.on('close', () => {
    clearInterval(hnTimer)
    clearTimeout(recheckTimer)
    unhookClicks()
  })
  load(win)

  // Every modal: no title bar, the page draws its own close button (src/Close.jsx)
  const popup = (opts) =>
    new BrowserWindow({
      icon: path.join(import.meta.dirname, 'tray.png'), // taskbar icon = the app's, not Electron's default
      frame: false,
      resizable: false,
      useContentSize: true,
      minimizable: false,
      maximizable: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(import.meta.dirname, 'preload.cjs') },
      ...opts,
    })

  let settings
  ipcMain.on('open-settings', () => {
    if (settings) return settings.focus()
    // height: the page reports its real height via 'fit'
    settings = popup({ width: SETTINGS_WIDTH, height: 400, title: 'ตั้งค่าการเชื่อมต่อ HOSxP' })
    settings.on('closed', () => (settings = null))
    load(settings, 'settings')
  })
  // popups report their content height; keep the width
  ipcMain.on('fit', (e, h) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    w?.setContentSize(w.getContentSize()[0], Math.ceil(h))
  })

  // page 'rules' = ตั้งเตือน (settings for everyone), 'hits' = what this patient meets (badge click)
  let rules
  function openRules(group, page = 'rules') {
    rules?.destroy() // one at a time, for the group just picked
    rules = popup({ width: 960, height: 640 })
    rules.on('closed', () => (rules = null))
    load(rules, `${page}?group=${group}`)
  }
  ipcMain.on('open-rules', (_e, group) => openRules(group))
  ipcMain.on('open-hits', (_e, group) => openRules(group, 'hits'))
  // ตั้งเตือน menu: native, since the 30px bar can't hold a dropdown. x, y = under the button.
  // PPFS (services to offer) sits apart from the lab/drug warnings. Icons: the badges' lucide icons as PNG
  // (electron/menu/, @2x picked up automatically), since native menus can't draw SVG.
  const item = (g, label) => ({ label, icon: path.join(import.meta.dirname, 'menu', `${g}.png`), click: () => openRules(g) })
  ipcMain.on('alert-menu', (_e, x, y) =>
    Menu.buildFromTemplate([item('rlu', 'RLU · Lab'), item('rdu', 'RDU · ยา'), { type: 'separator' }, item('ppfs', 'PPFS · บริการ PP')]).popup({ window: win, x, y }),
  )
  ipcMain.handle('get-alerts', (_e, group) => {
    const { hn, name, sex, age, typeArea, pttype, chronic, vstdate, vsttime } = patient
    return { patient: { hn, name, sex, age, typeArea, pttype, chronic, vstdate, vsttime }, group: GROUPS[group], hits: alerts[group], off: rulesOff() }
  })
  // เตือน/ไม่เตือน switch in the rules modal: re-check the current patient so the badge follows at once
  ipcMain.handle('set-rule', async (_e, group, id, on) => {
    setRuleOn(id, on)
    const hn = patient.hn
    if (hn) {
      const hits = await checkRules({ hn, vn: patient.vn ?? '' })
      if (patient.hn === hn) alerts = hits
    } else alerts = noAlerts()
    sendAlerts()
    return { hits: alerts[group], off: rulesOff() }
  })

  // The warning modal: items = [{ group, rule, rows }]
  let warning
  function openWarning(items) {
    warning?.destroy() // one at a time, the latest wins
    warning = popup({ width: 520, height: 200 })
    warning.on('closed', () => (warning = null))
    const q = new URLSearchParams({ hn: patient.hn, patient: patient.name ?? '', items: JSON.stringify(items) })
    load(warning, `warn?${q}`)
  }
  ipcMain.handle('get-db-config', () => loadDbConfig())
  ipcMain.handle('save-db-config', (_e, cfg) => saveDbConfig(cfg))
  ipcMain.handle('test-db', (_e, cfg) => testDb(cfg))
})

function load(win, hash = '') {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(`${devUrl}#${hash}`)
  else win.loadFile(path.join(import.meta.dirname, '../dist/index.html'), { hash })
}
