import VideoCard from './VideoCard'

export default function VideoDashboard({ videoMetadata }) {
    // Convert object to array if needed
    const videosArray = Array.isArray(videoMetadata) 
        ? videoMetadata 
        : Object.values(videoMetadata || {})

    return (
        <div className="w-full p-4" style={{ width: '100%' }}>
            <h2 className="text-2xl font-bold mb-4">Video Dashboard</h2>
            <div 
                className="flex flex-row flex-nowrap gap-4 overflow-x-auto" 
                style={{ 
                    display: 'flex', 
                    flexDirection: 'row', 
                    flexWrap: 'nowrap',
                    width: '100%',
                    overflowX: 'auto'
                }}
            >
                {videosArray.map((video, index) => (
                    <VideoCard key={video.id || index} thumbnail={video.thumbnail} title={video.name} date={video.date} />
                ))}
            </div>
        </div>
    )
} 