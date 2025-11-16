import Versions from './components/Versions'
import VideoDashboard from './components/VideoDashboard'
import SideBar from './components/SideBar'
import AccountInformation from './components/AccountInformation'
import VideoPlayer from './components/VideoPlayer'
import { useEffect, useState } from 'react'

function App() {

  const [videos, setVideos] = useState([])
  const [currentPage, setCurrentPage] = useState('Video Library')

  const scanFolder = async () => await window.api.scanFolder()
  const fetchThumbnail = async (filepath) => await window.api.fetchThumbnail(filepath)

  useEffect(() => {

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
        console.log("Fetching thumbnail for " + metadata.filepath)
        const thumbnailResponse = await fetchThumbnail(metadata.filepath)
        if (!thumbnailResponse['success']) {
          console.error("Failed to fetch thumbnail: " + thumbnailResponse['error'])
          continue
        }
        const thumbnail = thumbnailResponse['content']
        videoMetadata[videoKey]['thumbnail'] = thumbnail
        console.log(videoMetadata[videoKey])
      }
    
      setVideos(videoMetadata)
    }

    fetchVideos()

  }, [])

  return (
    <div className="app-container">
      <SideBar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className="app-main-content">
        {currentPage === 'Video Library' && <VideoDashboard videoMetadata={videos} setCurrentPage={setCurrentPage} currentPage={currentPage} />}
        {currentPage === 'Account Information' && <AccountInformation />}
        {currentPage.startsWith('video/') && <VideoPlayer hash={currentPage.split('/')[1]} />}
        <Versions></Versions>
      </div>
    </div>
  )
}

export default App
