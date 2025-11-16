import { useState, useEffect, useRef } from 'react'
import Hls from 'hls.js'
import AgentChat from './AgentChat'
import VideoGist from './VideoGist'

export default function VideoPlayer({ hash }) {
    const [videoContent, setVideoContent] = useState(null)
    const videoElement = useRef(null)
    const hlsRef = useRef(null)

    useEffect(() => {
        const fetchVideoContent = async () => {
            if (!hash) return
            const apiKey = localStorage.getItem('TWELVELABS_API_KEY')
            if (!apiKey) {
                console.error('TWELVELABS_API_KEY not found')
                return
            }
            const content = await window.api.getVideoContent(apiKey, hash)
            setVideoContent(content)
        }
        fetchVideoContent()
    }, [hash])

    useEffect(() => {
        const video = videoElement.current
        if (!video || !videoContent || !videoContent.hlsUrl) {
            return
        }

        console.log('Video content:', videoContent)
        console.log('Now playing video:', videoContent.hlsUrl)

        // Cleanup previous HLS instance
        if (hlsRef.current) {
            hlsRef.current.destroy()
            hlsRef.current = null
        }

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: false, // Disable worker to avoid CSP issues with blob URLs
                lowLatencyMode: false,
                xhrSetup: (xhr, url) => {
                    // Allow CORS for CloudFront
                    xhr.withCredentials = false
                }
            })
            hlsRef.current = hls

            hls.loadSource(videoContent.hlsUrl)
            hls.attachMedia(video)

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest parsed, attempting to play')
                if (video.readyState >= 2) { // HAVE_CURRENT_DATA
                    video.play().catch(error => {
                        console.error('Error playing video:', error)
                        // Try again after a short delay
                        setTimeout(() => {
                            video.play().catch(err => {
                                console.error('Retry play failed:', err)
                            })
                        }, 100)
                    })
                } else {
                    video.addEventListener('loadeddata', () => {
                        video.play().catch(error => {
                            console.error('Error playing video after loadeddata:', error)
                        })
                    }, { once: true })
                }
            })

            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    console.error('Fatal HLS error:', data.type, data)
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            console.error('Fatal network error, trying to recover')
                            hls.startLoad()
                            break
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            console.error('Fatal media error, trying to recover')
                            hls.recoverMediaError()
                            break
                        default:
                            console.error('Fatal error, destroying HLS instance')
                            hls.destroy()
                            break
                    }
                } else {
                    console.warn('Non-fatal HLS error:', data)
                }
            })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Native HLS support (Safari)
            video.src = videoContent.hlsUrl
            video.play().catch(error => {
                console.error('Error playing video:', error)
            })
        } else {
            console.error('HLS is not supported in this browser')
        }

        // Cleanup function
        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
        }
    }, [videoContent])

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A'
        try {
            const date = new Date(dateString)
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        } catch (e) {
            return dateString
        }
    }

    return (
        <div className="video-player">
            {videoContent && (
                <div className="video-player-header">
                    <div className="video-player-header-content">
                        <div className="video-player-header-item">
                            <span className="video-player-header-label">Video ID:</span>
                            <span className="video-player-header-value">{videoContent.videoId || 'N/A'}</span>
                        </div>
                        <div className="video-player-header-item">
                            <span className="video-player-header-label">Hash:</span>
                            <span className="video-player-header-value">{hash || 'N/A'}</span>
                        </div>
                        <div className="video-player-header-item">
                            <span className="video-player-header-label">Created:</span>
                            <span className="video-player-header-value">{formatDate(videoContent.createdAt)}</span>
                        </div>
                    </div>
                </div>
            )}
            <div className="video-player-container">
                <div className="video-player-video-wrapper">
                    <video ref={videoElement} controls />
                </div>
                {videoContent && (
                    <AgentChat videoId={videoContent.videoId} />
                )}
            </div>
            {videoContent && (
                <VideoGist videoId={videoContent.videoId} indexId={videoContent.indexId} />
            )}
        </div>
    )
}