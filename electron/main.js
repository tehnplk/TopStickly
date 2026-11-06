import { app, BrowserWindow, ipcMain, Menu, screen, Tray } from 'electron'
import path from 'node:path'
import { dockTop, undock, setRect, primaryScreen } from './appbar.js'
import { loadDbConfig, saveDbConfig, testDb, getPatient, getNsaids, getRecentLab } from './db.js'
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

// Tray menu; once an update is downloaded it offers to install it (never forced mid-work).
function setTrayMenu(updateVersion) {
  const items = [{ label: 'Quit', click: () => app.quit() }]
  if (updateVersion)
    items.unshift({ label: `อัปเดตเป็น v${updateVersion} แล้วเปิดใหม่`, click: () => autoUpdater.quitAndInstall() }, { type: 'separator' })
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

// Installed builds only: download updates from GitHub Releases in the background; they install on the
// next quit anyway, or right away from the tray menu.
function startAutoUpdate() {
  if (!app.isPackaged) return
  autoUpdater.on('update-downloaded', ({ version }) => {
    setTrayMenu(version)
    tray.displayBalloon({ title: 'TopStickly', content: `ดาวน์โหลดเวอร์ชัน ${version} แล้ว — คลิกขวาที่ไอคอนเพื่ออัปเดต` })
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
  startAutoUpdate()

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
  const sendPatient = () => win.webContents.send('patient', patient)
  const hnTimer = setInterval(async () => {
    const hn = readHn()
    if (hn === null || hn === patient.hn) return
    patient = { hn }
    sendPatient() // show the HN right away, name + last visit follow
    if (!hn) return
    const info = await getPatient(hn)
    if (patient.hn !== hn) return // HN changed while we were querying
    patient = { hn, ...info }
    sendPatient()
  }, HN_POLL_MS)
  win.webContents.on('did-finish-load', sendPatient)
  const unhookClicks = watchClicks(async (click) => {
    win.webContents.send('click', click)
    // Ticking a lab checkbox, or picking a lab in a combobox: warn if this patient already had that lab
    // within a year. checked === null (state unreadable) still warns: a needless warning beats a missed one.
    const picksLab = (click.action === 'check' && click.checked !== false) || click.action === 'select'
    if (!picksLab || !patient.hn) return
    const hn = patient.hn
    const lab = await getRecentLab(hn, click.caption).catch(() => null)
    if (lab && patient.hn === hn)
      openLabWarning({
        hn,
        patient: patient.name ?? '',
        lab: lab.name,
        order_date: lab.order_date,
        order_time: lab.order_time ?? '',
        days_ago: lab.days_ago,
        result: lab.result ?? '',
      })
  })
  win.on('close', () => {
    clearInterval(hnTimer)
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
    // height: the page reports its real height via 'fit-settings'
    settings = popup({ width: SETTINGS_WIDTH, height: 400, title: 'ตั้งค่าการเชื่อมต่อ HOSxP', resizable: false })
    settings.on('closed', () => (settings = null))
    load(settings, 'settings')
  })
  ipcMain.on('fit-settings', (_e, h) => settings?.setContentSize(SETTINGS_WIDTH, Math.ceil(h)))

  let drugs
  ipcMain.on('open-drugs', (_e, info) => {
    drugs?.destroy() // one at a time, always for the visit just clicked
    drugs = popup({ width: 720, height: 440, title: 'ยา NSAID' })
    drugs.on('closed', () => (drugs = null))
    load(drugs, `drugs?${new URLSearchParams(info)}`)
  })
  ipcMain.handle('get-nsaids', (_e, vn) => getNsaids(vn))

  let labWarning
  function openLabWarning(info) {
    labWarning?.destroy() // one at a time, for the latest click
    labWarning = popup({ width: 460, height: 200, frame: false, resizable: false }) // page draws its own close button
    labWarning.on('closed', () => (labWarning = null))
    load(labWarning, `labwarn?${new URLSearchParams(info)}`)
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
