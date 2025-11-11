import { useTheme } from '../contexts/ThemeContext'

const SunIcon = () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M10 2V4M10 16V18M18 10H16M4 10H2M15.66 4.34L14.24 5.76M5.76 14.24L4.34 15.66M15.66 15.66L14.24 14.24M5.76 5.76L4.34 4.34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
)

const MoonIcon = () => (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.5 11.5C17.5 15.0899 14.5899 18 11 18C10.1034 18 9.2529 17.7992 8.5 17.4444C11.5899 16.5 13.5 13.5899 13.5 10.5C13.5 7.41015 11.5899 4.5 8.5 3.55556C9.2529 3.20081 10.1034 3 11 3C14.5899 3 17.5 5.91015 17.5 9.5V11.5Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
    </svg>
)

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme()

    return (
        <div className="theme-toggle" onClick={toggleTheme}>
            <span className="theme-toggle-icon">
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </span>
            <span className="theme-toggle-label">
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </span>
        </div>
    )
}

