import VideoCard from './VideoCard'

export default function VideoDashboard({ videoMetadata }) {
    // Convert object to array if needed
    const videosArray = Array.isArray(videoMetadata) 
        ? videoMetadata 
        : Object.values(videoMetadata || {})

    const handleVideoHover = (isHovering, video) => {
        // This will be used later for video playback
        if (isHovering) {
            console.log('Hovering over video:', video.name)
            // Future: Start video playback here
        } else {
            console.log('Stopped hovering over video:', video.name)
            // Future: Pause video playback here
        }
    }

    return (
        <div className="video-dashboard">
            <div className="video-dashboard-header">
                <h1 className="video-dashboard-title">Your Zoom Recordings</h1>
                <p className="video-dashboard-subtitle">Bring your local video archive to advanced TwelveLabs video intelligence and AWS Strands Agent</p>
            </div>
            <div className="video-dashboard-grid">
                {videosArray.map((video, index) => (
                    <VideoCard 
                        key={video.id || index} 
                        thumbnail={video.thumbnail} 
                        title={video.name} 
                        date={video.date}
                        onHover={(isHovering) => handleVideoHover(isHovering, video)}
                    />
                ))}
            </div>
        </div>
    )
} 