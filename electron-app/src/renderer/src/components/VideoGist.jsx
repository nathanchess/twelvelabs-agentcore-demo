import { useState, useEffect } from 'react'

export default function VideoGist({ videoId, indexId }) {
    const [videoGist, setVideoGist] = useState(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const fetchVideoGist = async () => {
            if (!videoId || !indexId) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setError(null)

            try {
                const apiKey = localStorage.getItem('TWELVELABS_API_KEY')
                if (!apiKey) {
                    throw new Error('TWELVELABS_API_KEY not found')
                }

                if (!window.api || typeof window.api.getVideoGist !== 'function') {
                    throw new Error('getVideoGist API not available. Please restart the application.')
                }

                const result = await window.api.getVideoGist(apiKey, videoId, indexId)
                
                if (result.success) {
                    console.log('Video gist:', result.content)
                    setVideoGist(result.content)
                } else {
                    setError(result.error || 'Failed to load video gist')
                }
            } catch (err) {
                console.error('Error fetching video gist:', err)
                setError(err.message || 'Failed to load video gist')
            } finally {
                setIsLoading(false)
            }
        }

        fetchVideoGist()
    }, [videoId, indexId])

    const formatDuration = (seconds) => {
        if (!seconds) return 'N/A'
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = Math.floor(seconds % 60)
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`
    }

    const formatTime = (seconds) => {
        if (seconds === undefined || seconds === null) return '0:00'
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    if (!videoId || !indexId) {
        return null
    }

    return (
        <div className="video-gist">
            {isLoading ? (
                <div className="video-gist-loading">
                    <div className="video-gist-loading-spinner">
                        <svg className="video-gist-spinner-svg" viewBox="0 0 50 50">
                            <circle
                                className="video-gist-spinner-circle"
                                cx="25"
                                cy="25"
                                r="20"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                        </svg>
                    </div>
                    <div className="video-gist-loading-text">
                        <div className="video-gist-loading-line"></div>
                        <p>Generating video insights...</p>
                    </div>
                </div>
            ) : error ? (
                <div className="video-gist-error">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                        <path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <p>Error: {error}</p>
                </div>
            ) : videoGist ? (
                <div className="video-gist-content">
                    {/* Basic Info */}
                    <div className="video-gist-section video-gist-section-animate">
                        <div className="video-gist-section-header">
                            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M5 3H12L15 6V17C15 17.5523 14.5523 18 14 18H5C4.44772 18 4 17.5523 4 17V4C4 3.44772 4.44772 3 5 3Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                <path d="M12 3V7H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <h3>Video Information</h3>
                        </div>
                        <div className="video-gist-info-grid">
                            <div className="video-gist-info-item">
                                <span className="video-gist-info-label">Filename</span>
                                <span className="video-gist-info-value">{videoGist.filename || 'N/A'}</span>
                            </div>
                            <div className="video-gist-info-item">
                                <span className="video-gist-info-label">Duration</span>
                                <span className="video-gist-info-value">{formatDuration(videoGist.duration)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Summary */}
                    {videoGist.summary && (
                        <div className="video-gist-section video-gist-section-animate" style={{ animationDelay: '0.1s' }}>
                            <div className="video-gist-section-header">
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2 5H18M2 10H18M2 15H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <circle cx="15" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                </svg>
                                <h3>Summary</h3>
                            </div>
                            <div className="video-gist-summary">
                                <p>{videoGist.summary}</p>
                            </div>
                        </div>
                    )}

                    {/* Chapters */}
                    {videoGist.chapters && videoGist.chapters.length > 0 && (
                        <div className="video-gist-section video-gist-section-animate" style={{ animationDelay: '0.2s' }}>
                            <div className="video-gist-section-header">
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                    <path d="M10 6V10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <h3>Chapters</h3>
                            </div>
                            <div className="video-gist-chapters">
                                {videoGist.chapters.map((chapter, index) => (
                                    <div key={index} className="video-gist-chapter-item">
                                        <div className="video-gist-chapter-time">
                                            {formatTime(chapter.start)} - {formatTime(chapter.end)}
                                        </div>
                                        <div className="video-gist-chapter-title">
                                            {chapter.chapterTitle || chapter.title || `Chapter ${index + 1}`}
                                        </div>
                                        {(chapter.chapterSummary || chapter.summary) && (
                                            <div className="video-gist-chapter-summary">
                                                {chapter.chapterSummary || chapter.summary}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Transcript */}
                    {videoGist.transcript && videoGist.transcript.length > 0 && (
                        <div className="video-gist-section video-gist-section-animate" style={{ animationDelay: '0.3s' }}>
                            <div className="video-gist-section-header">
                                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M5 3H12L15 6V17C15 17.5523 14.5523 18 14 18H5C4.44772 18 4 17.5523 4 17V4C4 3.44772 4.44772 3 5 3Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                    <path d="M12 3V7H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M7 11H13M7 14H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                                <h3>Transcript</h3>
                            </div>
                            <div className="video-gist-transcript">
                                {videoGist.transcript.map((item, index) => (
                                    <div key={index} className="video-gist-transcript-item">
                                        <span className="video-gist-transcript-time">{formatTime(item.start)}</span>
                                        <span className="video-gist-transcript-text">{item.text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    )
}
