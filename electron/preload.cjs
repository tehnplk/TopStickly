const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bar', {
  setCollapsed: (collapsed) => ipcRenderer.send('set-collapsed', collapsed),
  setHover: (over) => ipcRenderer.send('hover', over),
  drag: (dragging) => ipcRenderer.send('drag', dragging),
  openSettings: () => ipcRenderer.send('open-settings'),
  onPatient: (cb) => {
    const listener = (_e, patient) => cb(patient)
    ipcRenderer.on('patient', listener)
    return () => ipcRenderer.off('patient', listener)
  },
  onUpdate: (cb) => {
    const listener = (_e, version) => cb(version)
    ipcRenderer.on('update', listener)
    return () => ipcRenderer.off('update', listener)
  },
  onAlerts: (cb) => {
    const listener = (_e, alerts) => cb(alerts)
    ipcRenderer.on('alerts', listener)
    return () => ipcRenderer.off('alerts', listener)
  },
  onSpying: (cb) => {
    const listener = (_e, on) => cb(on)
    ipcRenderer.on('spying', listener)
    return () => ipcRenderer.off('spying', listener)
  },
  onCollapsed: (cb) => {
    const listener = (_e, c) => cb(c)
    ipcRenderer.on('collapsed', listener)
    return () => ipcRenderer.off('collapsed', listener)
  },
  spy: () => ipcRenderer.send('spy'),
  installUpdate: () => ipcRenderer.send('install-update'),
  openRules: (group) => ipcRenderer.send('open-rules', group),
  openHits: (group) => ipcRenderer.send('open-hits', group),
  alertMenu: (x, y) => ipcRenderer.send('alert-menu', x, y),
  getAlerts: (group) => ipcRenderer.invoke('get-alerts', group),
  setRule: (group, id, on) => ipcRenderer.invoke('set-rule', group, id, on),
  fit: (height) => ipcRenderer.send('fit', height),
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (cfg) => ipcRenderer.invoke('save-db-config', cfg),
  testDb: (cfg) => ipcRenderer.invoke('test-db', cfg),
})
