import { useEffect, useState } from 'react'
import { useErrorModal } from '../contexts/ErrorModalContext'

export default function VideoCard({ thumbnail, title, date, filepath, onHover, setCurrentPage, currentPage, onDeleteClick }) {

    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)
    const [isIndexing, setIsIndexing] = useState(false)
    const [isIndexed, setIsIndexed] = useState(false)
    const [videoHash, setVideoHash] = useState(null)
    const { showError } = useErrorModal()

    // Check if video is indexed whenever VideoDashboard page is loaded
    useEffect(() => {
        // Only check if we're on the Video Library page
        if (currentPage !== 'Video Library') {
            return
        }

        console.log('Checking indexed status for video:', filepath)

        const checkIndexedStatus = async () => {
            try {
                const hash = await window.api.getVideoHash(filepath)
                setVideoHash(hash)
                
                try {
                    if (localStorage.getItem('TWELVELABS_API_KEY')) {
                        const videoContent = await window.api.getVideoContent(localStorage.getItem('TWELVELABS_API_KEY'), hash)
                        if (videoContent) {
                            setIsIndexed(true)
                        } else {
                            setIsIndexed(false)
                        }
                    } 
                } catch (error) {
                    setIsIndexed(false)
                }
            } catch (error) {
                setIsIndexed(false)
            }
        }

        checkIndexedStatus()
    }, [currentPage, filepath])

    // Format date if it's a Date object, otherwise use as string
    const formattedDate = date 
        ? (date instanceof Date 
            ? date.toLocaleDateString() 
            : String(date))
        : '';

    const handleMouseEnter = () => {
        setIsHovered(true)
        if (onHover) {
            onHover(true)
        }
    }

    const handleMouseLeave = () => {
        setIsHovered(false)
        if (onHover) {
            onHover(false)
        }
    }

    const handleMouseDown = () => {
        setIsPressed(true)
    }

    const handleMouseUp = () => {
        setIsPressed(false)
    }

    const handleClick = async (e) => {
        // Don't trigger if clicking on delete button
        if (e.target.closest('.video-card-delete-button')) {
            return
        }

        // If already indexed, navigate to video page
        if (isIndexed && videoHash) {
            if (setCurrentPage) {
                setCurrentPage('video/' + videoHash)
            }
            return
        }

        // Otherwise, index the video
        setIsIndexing(true)
        try {
            const twelvelabsApiKey = localStorage.getItem('TWELVELABS_API_KEY')
            if (!twelvelabsApiKey) {
                throw new Error('TwelveLabs API key not found. Please add your API key in Account Information.')
            }
            const result = await window.api.indexVideo(twelvelabsApiKey, filepath)
            if (!result.success) {
                throw new Error(result.error || 'Failed to index video')
            }
            
            // Update indexed status
            setIsIndexed(true)
            if (result.content.hash) {
                setVideoHash(result.content.hash)
            }
            
            showError('Video indexed successfully!', 'success', 3000)
            if (setCurrentPage && result.content.hash) {
                setCurrentPage('video/' + result.content.hash)
            }
        } catch (error) {
            console.error('Error indexing video:', error)
            const errorMessage = error.message || 'An error occurred while indexing the video'
            showError(errorMessage, 'error', 5000)
        } finally {
            setIsIndexing(false)
        }
    }

    const handleDeleteClick = (e) => {
        e.stopPropagation()
        if (onDeleteClick) {
            onDeleteClick({ title, filepath })
        }
    }

    return (
        <div 
            className={`video-card ${isPressed ? 'video-card-pressed' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onClick={handleClick}
        >
            <div className="video-card-image-wrapper">
                {thumbnail ? (
                <img 
                    src={thumbnail} 
                    alt={title} 
                    className={`video-card-image ${isHovered ? 'video-card-image-hover' : ''} ${isIndexing ? 'video-card-image-indexing' : ''}`}
                        onError={(e) => {
                            console.error('=== IMAGE LOAD ERROR ===');
                            console.error('Thumbnail URL:', thumbnail);
                            console.error('Image src:', e.target?.src);
                            console.error('Image currentSrc:', e.target?.currentSrc);
                            console.error('Error event:', e);
                            console.error('Error type:', e.type);
                            // Try to get more info about the error
                            if (e.target) {
                                console.error('Image naturalWidth:', e.target.naturalWidth);
                                console.error('Image naturalHeight:', e.target.naturalHeight);
                                console.error('Image complete:', e.target.complete);
                            }
                        }}
                    />
                ) : (
                    <div className="video-card-image video-card-image-placeholder">
                        <span>No thumbnail</span>
                    </div>
                )}
                {isIndexing && (
                    <div className="video-card-indexing-overlay">
                        <div className="video-card-indexing-content">
                            <div className="video-card-indexing-spinner">
                                <svg className="video-card-spinner-svg" viewBox="0 0 50 50">
                                    <circle
                                        className="video-card-spinner-circle"
                                        cx="25"
                                        cy="25"
                                        r="20"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                </svg>
                            </div>
                            <p className="video-card-indexing-text">
                                Indexing to TwelveLabs
                                <span className="video-card-indexing-dots">
                                    <span className="dot">.</span>
                                    <span className="dot">.</span>
                                    <span className="dot">.</span>
                                </span>
                            </p>
                        </div>
                    </div>
                )}
                {isIndexed && !isIndexing && (
                    <div className="video-card-indexed-badge">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Indexed</span>
                    </div>
                )}
                {isHovered && !isIndexing && (
                    <button 
                        className="video-card-delete-button"
                        onClick={handleDeleteClick}
                        aria-label="Delete video"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path 
                                d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                            />
                            <path 
                                d="M10 11V17M14 11V17" 
                                stroke="currentColor" 
                                strokeWidth="2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                )}
                <div className="video-card-overlay">
                    <div className="video-card-info">
                        <h3 className="video-card-title">{title}</h3>
                        {formattedDate && (
                            <p className="video-card-date">{formattedDate}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}