import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Settings from './Settings.jsx'
import Rules from './Rules.jsx'
import Warn from './Warn.jsx'

const page = location.hash.slice(1).split('?')[0]
const Page = { settings: Settings, rules: Rules, warn: Warn }[page] ?? App

createRoot(document.getElementById('root')).render(<Page />)
