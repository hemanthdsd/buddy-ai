import React from 'react'
import Bubble from './components/Bubble'
import AssistantPanel from './components/AssistantPanel'
import SelectionIcon from './components/SelectionIcon'
import QuickPanel from './components/QuickPanel'
import SnipWindow from './components/SnipWindow'

// ─── Window router ────────────────────────────────────────────────────────────
// Reads ?window= from the URL to decide which component to render.
//
// Supported windows:
//   ?window=bubble        → floating bubble (always visible)
//   ?window=panel         → full assistant panel (Ctrl+Shift+E / bubble click)
//   ?window=selectionicon → tiny 44×44 icon shown near selected text
//   ?window=quickpanel    → compact quick-action panel (click the icon to open)

const params = new URLSearchParams(window.location.search)
const windowType = params.get('window') ?? 'bubble'

const App: React.FC = () => {
  switch (windowType) {
    case 'bubble':
      return <Bubble />

    case 'panel':
      return <AssistantPanel />

    case 'selectionicon':
      return <SelectionIcon />

    case 'quickpanel':
      return <QuickPanel />

    case 'snip':
      return <SnipWindow />

    default:
      return (
        <div style={{ color: '#fff', padding: 24, fontFamily: 'Inter, sans-serif' }}>
          Unknown window type: {windowType}
        </div>
      )
  }
}

export default App

