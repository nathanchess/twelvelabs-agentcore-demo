import { useState } from 'react'
import { useErrorModal } from '../contexts/ErrorModalContext'

export default function VideoCard({ thumbnail, title, date, filepath, onHover, setCurrentPage }) {

    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)
    const [isIndexing, setIsIndexing] = useState(false)
    const { showError } = useErrorModal()

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

    const handleClick = async () => {
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
            
            showError('Video indexed successfully!', 'success', 3000)
            setCurrentPage('video/' + result.content.hash)
        } catch (error) {
            console.error('Error indexing video:', error)
            const errorMessage = error.message || 'An error occurred while indexing the video'
            showError(errorMessage, 'error', 5000)
        } finally {
            setIsIndexing(false)
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
                <img 
                    src={thumbnail} 
                    alt={title} 
                    className={`video-card-image ${isHovered ? 'video-card-image-hover' : ''} ${isIndexing ? 'video-card-image-indexing' : ''}`}
                />
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