import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron'
import path from 'node:path'
import { dockTop, undock, setRect, primaryScreen } from './appbar.js'
import { loadDbConfig, saveDbConfig, testDb, getPatient } from './db.js'
import { GROUPS, checkRules, rulesOff, setRuleOn } from './rules.js'
import { readHn, watchClicks } from './hosxp.js'
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
  screen.on('display-metrics-changed', pin)

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
    const { x, y, width, scale } = primaryScreen()
    const w = Math.round(COLLAPSED_WIDTH * scale)
    const to = { x: x + Math.round((width - w) / 2), y, width: w, height: Math.round(COLLAPSED_HEIGHT * scale) }
    animate(to, COLLAPSED_OPACITY, () => undock(win)) // give the strip back to other apps once shrunk
  }

  ipcMain.on('set-collapsed', (_e, c) => (c ? collapse() : expand()))
  ipcMain.on('hover', (_e, over) => {
    // skip mid-animation so the collapse's undock callback isn't cancelled
    if (collapsed && !timer) animate({ ...target }, over ? HOVER_OPACITY : COLLAPSED_OPACITY)
  })
  target = dockTop(win, BAR_HEIGHT)
  pin()
  win.once('ready-to-show', () => win.show())
  win.on('close', () => {
    clearInterval(timer)
    screen.off('display-metrics-changed', pin) // undock fires it after the window is gone
    undock(win)
  })

  win.on('closed', () => app.quit()) // the bar is the app; take the settings window down with it

  // ponytail: 1s polling of HOSxP's HN box; switch to SetWinEventHook(EVENT_OBJECT_VALUECHANGE) if lag matters
  let patient = { hn: '' }
  // Rule hits for the current patient: group → [{ id, name, rows }]. Rules: electron/rules.js.
  // The warning itself is a modal: RDU pops up when a rule is hit, RLU when the flagged lab is ticked.
  const noAlerts = () => ({ rlu: [], rdu: [], claim: [] })
  let alerts = noAlerts()
  let shown = new Set() // RDU rule ids already popped up for this patient
  const sendPatient = () => win.webContents.send('patient', patient)
  // badge = rules switched on / all rules, per group (a setting, not a warning)
  const sendAlerts = () => {
    const off = new Set(rulesOff())
    const count = Object.fromEntries(Object.entries(GROUPS).map(([g, { rules }]) => [g, { on: rules.filter((r) => !off.has(r.id)).length, total: rules.length }]))
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
  const hnTimer = setInterval(() => {
    const hn = readHn()
    if (hn === null || hn === patient.hn) return
    patient = { hn }
    alerts = noAlerts()
    shown = new Set()
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
    win.webContents.send('click', click)
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

  const popup = (opts) =>
    new BrowserWindow({
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
    settings = popup({ width: SETTINGS_WIDTH, height: 400, title: 'ตั้งค่าการเชื่อมต่อ HOSxP', resizable: false })
    settings.on('closed', () => (settings = null))
    load(settings, 'settings')
  })
  // popups report their content height; keep the width
  ipcMain.on('fit', (e, h) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    w?.setContentSize(w.getContentSize()[0], Math.ceil(h))
  })

  let rules
  ipcMain.on('open-rules', (_e, group) => {
    rules?.destroy() // one at a time, for the badge just clicked
    rules = popup({ width: 960, height: 640 })
    rules.on('closed', () => (rules = null))
    load(rules, `rules?group=${group}`)
  })
  ipcMain.handle('get-alerts', (_e, group) => {
    const { hn, name, vstdate, vsttime } = patient
    return { patient: { hn, name, vstdate, vsttime }, group: GROUPS[group], hits: alerts[group], off: rulesOff() }
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
    warning = popup({ width: 520, height: 200, frame: false, resizable: false }) // page draws its own close button
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
