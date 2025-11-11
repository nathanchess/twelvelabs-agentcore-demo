import { createContext, useContext, useState } from 'react'
import ErrorModal from '../components/ErrorModal'

const ErrorModalContext = createContext()

export function ErrorModalProvider({ children }) {
    const [modal, setModal] = useState(null)

    const showError = (message, type = 'error', duration = 5000) => {
        const id = Date.now()
        setModal({
            id,
            message,
            type,
            duration
        })
    }

    const hideError = () => {
        setModal(null)
    }

    return (
        <ErrorModalContext.Provider value={{ showError }}>
            {children}
            {modal && (
                <ErrorModal
                    key={modal.id}
                    message={modal.message}
                    type={modal.type}
                    duration={modal.duration}
                    onClose={hideError}
                />
            )}
        </ErrorModalContext.Provider>
    )
}

export function useErrorModal() {
    const context = useContext(ErrorModalContext)
    if (!context) {
        throw new Error('useErrorModal must be used within an ErrorModalProvider')
    }
    return context
}

