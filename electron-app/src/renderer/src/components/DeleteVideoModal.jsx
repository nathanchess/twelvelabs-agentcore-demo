import { useEffect, useState } from 'react'

export default function DeleteVideoModal({ isOpen, onClose, onConfirm, videoTitle }) {
    const [isVisible, setIsVisible] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true)
            // Trigger animation after a brief delay
            setTimeout(() => setIsAnimating(true), 10)
        } else {
            setIsAnimating(false)
            // Wait for animation to complete before hiding
            setTimeout(() => setIsVisible(false), 300)
        }
    }, [isOpen])

    const handleConfirm = () => {
        setIsAnimating(false)
        setTimeout(() => {
            onConfirm()
            onClose()
        }, 200)
    }

    const handleCancel = () => {
        setIsAnimating(false)
        setTimeout(() => {
            onClose()
        }, 200)
    }

    if (!isVisible) return null

    return (
        <div 
            className={`delete-video-modal-backdrop ${isAnimating ? 'delete-modal-active' : ''}`}
            onClick={handleCancel}
        >
            <div 
                className={`delete-video-modal ${isAnimating ? 'delete-modal-zoom-in' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="delete-video-modal-content">
                    <div className="delete-video-modal-icon-wrapper">
                        <div className="delete-video-modal-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                        </div>
                    </div>
                    <h2 className="delete-video-modal-title">Delete Video?</h2>
                    <p className="delete-video-modal-message">
                        Are you sure you want to delete <strong>{videoTitle}</strong>? 
                        This will remove it from your local library and the TwelveLabs index (if indexed).
                        This action cannot be undone.
                    </p>
                    <div className="delete-video-modal-actions">
                        <button 
                            className="delete-video-modal-button delete-video-modal-button-cancel"
                            onClick={handleCancel}
                        >
                            Cancel
                        </button>
                        <button 
                            className="delete-video-modal-button delete-video-modal-button-confirm"
                            onClick={handleConfirm}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

