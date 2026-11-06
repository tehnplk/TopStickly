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
  installUpdate: () => ipcRenderer.send('install-update'),
  openDrugs: (info) => ipcRenderer.send('open-drugs', info),
  getNsaids: (vn) => ipcRenderer.invoke('get-nsaids', vn),
  fitSettings: (height) => ipcRenderer.send('fit-settings', height),
  getDbConfig: () => ipcRenderer.invoke('get-db-config'),
  saveDbConfig: (cfg) => ipcRenderer.invoke('save-db-config', cfg),
  testDb: (cfg) => ipcRenderer.invoke('test-db', cfg),
})
