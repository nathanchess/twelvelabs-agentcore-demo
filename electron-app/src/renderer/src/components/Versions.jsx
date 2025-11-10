import { useState } from 'react'

function Versions() {
  const [versions] = useState(window.electron.process.versions)

  return (
    <div className="versions">
      <span className="versions-label">Electron v{versions.electron}</span>
      <span className="versions-separator">•</span>
      <span className="versions-label">Chromium v{versions.chrome}</span>
      <span className="versions-separator">•</span>
      <span className="versions-label">Node v{versions.node}</span>
    </div>
  )
}

export default Versions
