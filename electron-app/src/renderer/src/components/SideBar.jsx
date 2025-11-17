import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import ThemeToggle from './ThemeToggle'
import tlLogoBlack from '../../../../resources/tl_logo_black.png'
import tlLogoWhite from '../../../../resources/tl_logo_white.png'

// Simple SVG icon components
const VideoIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M14 6L18 4V16L14 14V6Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
)

const SettingsIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
)

const UserIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M4 17C4 13.5 6.5 11 10 11C13.5 11 16 13.5 16 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
)

const DocumentIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3H12L15 6V17C15 17.5523 14.5523 18 14 18H5C4.44772 18 4 17.5523 4 17V4C4 3.44772 4.44772 3 5 3Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M12 3V7H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
)

export default function SideBar({ currentPage, setCurrentPage }) {
    const { theme } = useTheme()

    const menuItems = [
        { id: 'Video Library', label: 'Video Library', icon: VideoIcon },
        { id: 'Account Information', label: 'Account Information', icon: UserIcon },
        { id: 'Documentation', label: 'Documentation', icon: DocumentIcon }
    ]

    const handleItemClick = (itemId) => {
        setCurrentPage(itemId)
        // Future: Add navigation logic here
        console.log('Navigating to:', itemId)
    }

    return (
        <div className="sidebar">
            <div className="sidebar-header">
                <img 
                    src={theme === 'dark' ? tlLogoWhite : tlLogoBlack} 
                    alt="TwelveLabs" 
                    className="sidebar-logo"
                />
            </div>
            <nav className="sidebar-nav">
                {menuItems.map((item) => {
                    const IconComponent = item.icon
                    return (
                        <div
                            key={item.id}
                            className={`sidebar-item ${currentPage === item.id ? 'sidebar-item-active' : ''}`}
                            onClick={() => handleItemClick(item.id)}
                        >
                            <span className="sidebar-icon">
                                <IconComponent />
                            </span>
                            <span className="sidebar-label">{item.label}</span>
                        </div>
                    )
                })}
            </nav>
            <div className="sidebar-footer">
                <ThemeToggle />
            </div>
        </div>
    )
}

