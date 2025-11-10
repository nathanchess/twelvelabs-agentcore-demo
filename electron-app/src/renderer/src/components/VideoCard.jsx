import { useState } from 'react'

export default function VideoCard({ thumbnail, title, date, onHover }) {
    const [isHovered, setIsHovered] = useState(false)
    const [isPressed, setIsPressed] = useState(false)

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

    return (
        <div 
            className={`video-card ${isPressed ? 'video-card-pressed' : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
        >
            <div className="video-card-image-wrapper">
                <img 
                    src={thumbnail} 
                    alt={title} 
                    className={`video-card-image ${isHovered ? 'video-card-image-hover' : ''}`}
                />
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