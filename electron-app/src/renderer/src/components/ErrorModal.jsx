import { useEffect, useState, useRef, useCallback } from 'react'

export default function ErrorModal({ message, type = 'error', onClose, duration = 5000 }) {
    const [isVisible, setIsVisible] = useState(false)
    const [progress, setProgress] = useState(100)
    const progressIntervalRef = useRef(null)
    const timeoutRef = useRef(null)

    const handleClose = useCallback(() => {
        setIsVisible(false)
        // Wait for fade-out animation before calling onClose
        setTimeout(() => {
            if (onClose) {
                onClose()
            }
        }, 300)
    }, [onClose])

    useEffect(() => {
        // Trigger fade-in animation
        setIsVisible(true)
        setProgress(100)

        // Start progress bar animation
        const startTime = Date.now()
        const updateProgress = () => {
            const elapsed = Date.now() - startTime
            const remaining = Math.max(0, duration - elapsed)
            const progressPercent = (remaining / duration) * 100
            setProgress(progressPercent)

            if (remaining > 0) {
                progressIntervalRef.current = requestAnimationFrame(updateProgress)
            }
        }
        progressIntervalRef.current = requestAnimationFrame(updateProgress)

        // Auto-close after duration
        timeoutRef.current = setTimeout(() => {
            handleClose()
        }, duration)

        return () => {
            if (progressIntervalRef.current) {
                cancelAnimationFrame(progressIntervalRef.current)
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
            }
        }
    }, [message, type, duration, handleClose])

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    borderColor: '#00ff88',
                    iconBg: 'rgba(0, 255, 136, 0.15)',
                    iconColor: '#00ff88',
                    progressColor: '#00ff88'
                }
            case 'warning':
                return {
                    borderColor: '#ffaa00',
                    iconBg: 'rgba(255, 170, 0, 0.15)',
                    iconColor: '#ffaa00',
                    progressColor: '#ffaa00'
                }
            case 'error':
            default:
                return {
                    borderColor: '#ff4444',
                    iconBg: 'rgba(255, 68, 68, 0.15)',
                    iconColor: '#ff4444',
                    progressColor: '#ff4444'
                }
        }
    }

    const getIcon = () => {
        switch (type) {
            case 'success':
                return (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.6667 5L7.50004 14.1667L3.33337 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                )
            case 'warning':
                return (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 6.66667V10M10 13.3333H10.0083M18.3333 10C18.3333 14.6024 14.6024 18.3333 10 18.3333C5.39765 18.3333 1.66667 14.6024 1.66667 10C1.66667 5.39765 5.39765 1.66667 10 1.66667C14.6024 1.66667 18.3333 5.39765 18.3333 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                )
            case 'error':
            default:
                return (
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 18.3333C14.6024 18.3333 18.3333 14.6024 18.3333 10C18.3333 5.39765 14.6024 1.66667 10 1.66667C5.39765 1.66667 1.66667 5.39765 1.66667 10C1.66667 14.6024 5.39765 18.3333 10 18.3333Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 6.66667V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 13.3333H10.0083" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                )
        }
    }

    const styles = getTypeStyles()

    return (
        <div className={`error-modal ${isVisible ? 'error-modal-visible' : ''}`}>
            <div 
                className="error-modal-content"
                style={{ borderLeftColor: styles.borderColor }}
            >
                <div className="error-modal-header">
                    <div 
                        className="error-modal-icon"
                        style={{ 
                            backgroundColor: styles.iconBg,
                            color: styles.iconColor
                        }}
                    >
                        {getIcon()}
                    </div>
                    <button 
                        className="error-modal-close"
                        onClick={handleClose}
                        aria-label="Close"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </button>
                </div>
                <div className="error-modal-body">
                    <p className="error-modal-message">{message}</p>
                </div>
                <div className="error-modal-progress-container">
                    <div 
                        className="error-modal-progress-bar"
                        style={{ 
                            width: `${progress}%`,
                            backgroundColor: styles.progressColor
                        }}
                    />
                </div>
            </div>
        </div>
    )
}

