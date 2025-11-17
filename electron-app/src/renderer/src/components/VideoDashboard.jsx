import { useState } from 'react'
import VideoCard from './VideoCard'
import UploadVideo from './UploadVideo'
import DeleteVideoModal from './DeleteVideoModal'
import { useErrorModal } from '../contexts/ErrorModalContext'

export default function VideoDashboard({ videoMetadata, setCurrentPage, currentPage, onVideoDeleted }) {
    // Convert object to array if needed
    const videosArray = Array.isArray(videoMetadata) 
        ? videoMetadata 
        : Object.values(videoMetadata || {})

    const [deleteModalState, setDeleteModalState] = useState({ isOpen: false, video: null })
    const { showError } = useErrorModal()

    const handleVideoHover = (isHovering, video) => {
        // This will be used later for video playback
        if (isHovering) {
            
            // Future: Start video playback here
        } else {
            
            // Future: Pause video playback here
        }
    }

    const handleDeleteClick = (video) => {
        setDeleteModalState({ isOpen: true, video })
    }

    const handleDeleteConfirm = async () => {
        if (!deleteModalState.video) return

        try {
            const twelvelabsApiKey = localStorage.getItem('TWELVELABS_API_KEY')
            const result = await window.api.deleteVideo(twelvelabsApiKey || null, deleteModalState.video.filepath)
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to delete video')
            }
            
            showError('Video deleted successfully!', 'success', 3000)
            setDeleteModalState({ isOpen: false, video: null })
            
            // Call the onDelete callback to refresh the video list
            if (onVideoDeleted) {
                onVideoDeleted()
            }
        } catch (error) {
            console.error('Error deleting video:', error)
            const errorMessage = error.message || 'An error occurred while deleting the video'
            showError(errorMessage, 'error', 5000)
        }
    }

    const handleDeleteCancel = () => {
        setDeleteModalState({ isOpen: false, video: null })
    }

    return (
        <div className="video-dashboard">
            <div className="video-dashboard-header">
                <h1 className="video-dashboard-title">Your Zoom Recordings</h1>
                <p className="video-dashboard-subtitle">Bring your local video archive to advanced TwelveLabs video intelligence and AWS Strands Agent</p>
            </div>
            <div className="video-dashboard-grid">
                <UploadVideo />
                {videosArray.map((video, index) => (
                    <VideoCard 
                        key={video.id || index} 
                        thumbnail={video.thumbnail} 
                        title={video.name} 
                        date={video.date}
                        filepath={video.filepath}
                        onHover={(isHovering) => handleVideoHover(isHovering, video)}
                        setCurrentPage={setCurrentPage}
                        currentPage={currentPage}
                        onDeleteClick={handleDeleteClick}
                    />
                ))}
            </div>
            <DeleteVideoModal
                isOpen={deleteModalState.isOpen}
                onClose={handleDeleteCancel}
                onConfirm={handleDeleteConfirm}
                videoTitle={deleteModalState.video?.title || ''}
            />
        </div>
    )
} 