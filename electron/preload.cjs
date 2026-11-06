const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('bar', {
  setCollapsed: (collapsed) => ipcRenderer.send('set-collapsed', collapsed),
  setHover: (over) => ipcRenderer.send('hover', over),
  openSettings: () => ipcRenderer.send('open-settings'),
  onPatient: (cb) => {
    const listener = (_e, patient) => cb(patient)
    ipcRenderer.on('patient', listener)
    return () => ipcRenderer.off('patient', listener)
  },
  onClick: (cb) => {
    const listener = (_e, click) => cb(click)
    ipcRenderer.on('click', listener)
    return () => ipcRenderer.off('click', listener)
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
  installUpdate: () => ipcRenderer.send('install-update'),
  openRules: (group) => ipcRenderer.send('open-rules', group),
  getAlerts: (group) => ipcRenderer.invoke('get-alerts', group),
  setRule: (group, id, on) => ipcRenderer.invoke('set-rule', group, id, on),
  fit: (height) => ipcRenderer.send('fit', height),
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (cfg) => ipcRenderer.invoke('save-db-config', cfg),
  testDb: (cfg) => ipcRenderer.invoke('test-db', cfg),
})
