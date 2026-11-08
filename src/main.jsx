import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Settings from './Settings.jsx'
import Rules from './Rules.jsx'
import Hits from './Hits.jsx'
import Warn from './Warn.jsx'
import Spy from './Spy.jsx'

const page = location.hash.slice(1).split('?')[0]
const Page = { settings: Settings, rules: Rules, hits: Hits, warn: Warn, spy: Spy }[page] ?? App

createRoot(document.getElementById('root')).render(<Page />)
