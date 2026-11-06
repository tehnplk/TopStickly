import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Settings from './Settings.jsx'
import Drugs from './Drugs.jsx'
import LabWarn from './LabWarn.jsx'

const page = location.hash.slice(1).split('?')[0]
const Page = { settings: Settings, drugs: Drugs, labwarn: LabWarn }[page] ?? App

createRoot(document.getElementById('root')).render(<Page />)
