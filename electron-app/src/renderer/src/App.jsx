import Versions from './components/Versions'
import VideoDashboard from './components/VideoDashboard'
import SideBar from './components/SideBar'
import AccountInformation from './components/AccountInformation'
import VideoPlayer from './components/VideoPlayer'
import { useEffect, useState } from 'react'

// Track if env variables have been sent (persists across component remounts)
let envVariablesSent = false

function App() {

  const [videos, setVideos] = useState([])
  const [currentPage, setCurrentPage] = useState('Video Library')

  const scanFolder = async () => await window.api.scanFolder()
  const fetchThumbnail = async (filepath) => await window.api.fetchThumbnail(filepath)

  const fetchVideos = async () => {
    
    const result = await scanFolder()

    if (!result['success']) {
      console.error("Failed to scan folder: " + result['error'])
      return
    }

    const videoMetadata = result['content']

    // Fetch thumbnails for each video, given the file path.
    for (const videoKey in videoMetadata) {
      const metadata = videoMetadata[videoKey]
      const thumbnailResponse = await fetchThumbnail(metadata.filepath)
      if (!thumbnailResponse['success']) {
        console.error("Failed to fetch thumbnail: " + thumbnailResponse['error'])
        continue
      }
      const thumbnail = thumbnailResponse['content']
      videoMetadata[videoKey]['thumbnail'] = thumbnail
    }
  
    setVideos(videoMetadata)
  }

  const sendEnvVariables = async () => {
    // Only send once on app load
    if (envVariablesSent) {
      return
    }
    
    envVariablesSent = true
    
    const twelveLabsApiKey = localStorage.getItem('TWELVELABS_API_KEY')
    const slack_bot_token = localStorage.getItem('SLACK_BOT_TOKEN')
    const slack_app_token = localStorage.getItem('SLACK_APP_TOKEN')

    await window.api.promptStrandsAgent(
      "Send the environment variables to the agent and enable socket mode for Slack auto reply",
      twelveLabsApiKey,
      slack_bot_token,
      slack_app_token,
      [],
      ""
    )
  }

  const createAgentSession = async () => {
    const sessionId = await window.api.createAgentSession()
    console.log('Agent session created:', sessionId)
  }

  useEffect(() => {
    fetchVideos()
    sendEnvVariables()
    createAgentSession()
  }, [])

  const handleVideoDeleted = () => {
    // Refresh the video list after deletion
    fetchVideos()
  }

  return (
    <div className="app-container">
      <SideBar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className="app-main-content">
        {currentPage === 'Video Library' && <VideoDashboard videoMetadata={videos} setCurrentPage={setCurrentPage} currentPage={currentPage} onVideoDeleted={handleVideoDeleted} />}
        {currentPage === 'Account Information' && <AccountInformation />}
        {currentPage.startsWith('video/') && <VideoPlayer hash={currentPage.split('/')[1]} />}
        <Versions></Versions>
      </div>
    </div>
  )
}

export default App
