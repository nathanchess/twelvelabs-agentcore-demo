import { useState, useRef, useEffect } from 'react'

export default function UploadVideo() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedFilePath, setSelectedFilePath] = useState(null)
    const [selectedFileName, setSelectedFileName] = useState(null)
    const [targetFileName, setTargetFileName] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [uploadStatus, setUploadStatus] = useState(null) // 'success' | 'error' | null
    const [errorMessage, setErrorMessage] = useState('')
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(null)
    const videoPreviewRef = useRef(null)

    // Generate preview URL when file is selected
    useEffect(() => {
        if (selectedFilePath) {
            // Use custom video:// protocol for preview
            const encodedPath = encodeURIComponent(selectedFilePath)
            setVideoPreviewUrl(`video://${encodedPath}`)
            
            // Extract filename without extension for targetFileName
            const fileName = selectedFilePath.split(/[/\\]/).pop()
            const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '')
            setTargetFileName(nameWithoutExt)
        } else {
            setVideoPreviewUrl(null)
        }
    }, [selectedFilePath])

    const handleOpenModal = () => {
        setIsModalOpen(true)
        setSelectedFilePath(null)
        setSelectedFileName(null)
        setTargetFileName('')
        setUploadStatus(null)
        setErrorMessage('')
    }

    const handleCloseModal = () => {
        if (!isUploading) {
            setIsModalOpen(false)
            setSelectedFilePath(null)
            setSelectedFileName(null)
            setTargetFileName('')
            setUploadStatus(null)
            setErrorMessage('')
            setVideoPreviewUrl(null)
        }
    }

    const handleSelectFile = async () => {
        try {
            const result = await window.api.showOpenDialog({
                title: 'Select Video File',
                filters: [
                    { name: 'Video Files', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                properties: ['openFile']
            })

            if (result.success && !result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0]
                const fileName = filePath.split(/[/\\]/).pop()
                setSelectedFilePath(filePath)
                setSelectedFileName(fileName)
            }
        } catch (error) {
            console.error('Error selecting file:', error)
            setUploadStatus('error')
            setErrorMessage('Failed to select file: ' + error.message)
        }
    }

    const handleUpload = async () => {
        if (!selectedFilePath || !targetFileName.trim()) {
            setUploadStatus('error')
            setErrorMessage('Please select a file and enter a target file name')
            return
        }

        setIsUploading(true)
        setUploadStatus(null)
        setErrorMessage('')

        try {
            const result = await window.api.uploadVideo(selectedFilePath, targetFileName.trim())

            if (result.success) {
                setUploadStatus('success')
                // Close modal after 2 seconds
                setTimeout(() => {
                    setIsModalOpen(false)
                    setSelectedFilePath(null)
                    setSelectedFileName(null)
                    setTargetFileName('')
                    setUploadStatus(null)
                    setErrorMessage('')
                    setVideoPreviewUrl(null)
                    // Refresh the video list by reloading the page or triggering a refresh
                    window.location.reload()
                }, 2000)
            } else {
                setUploadStatus('error')
                setErrorMessage(result.error || 'Failed to upload video')
            }
        } catch (error) {
            console.error('Error uploading video:', error)
            setUploadStatus('error')
            setErrorMessage(error.message || 'An error occurred while uploading the video')
        } finally {
            setIsUploading(false)
        }
    }

    // Handle click outside modal to close
    const handleModalBackdropClick = (e) => {
        if (e.target === e.currentTarget && !isUploading) {
            handleCloseModal()
        }
    }

    return (
        <>
            {/* Upload Button */}
            <div 
                className="upload-video-card"
                onClick={handleOpenModal}
            >
                <div className="upload-video-card-content">
                    <div className="upload-video-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 15V3M12 3L8 7M12 3L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="upload-video-text">
                        <h3>Upload Video</h3>
                        <p>Add a new video to your library</p>
                    </div>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="upload-video-modal-backdrop" onClick={handleModalBackdropClick}>
                    <div className="upload-video-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="upload-video-modal-header">
                            <h2>Upload Video</h2>
                            <button 
                                className="upload-video-modal-close"
                                onClick={handleCloseModal}
                                disabled={isUploading}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                        </div>

                        <div className="upload-video-modal-content">
                            {/* File Selection */}
                            {!selectedFilePath ? (
                                <div className="upload-video-file-selector">
                                    <div className="upload-video-file-selector-content">
                                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M16 13H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M16 17H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            <path d="M10 9H9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                        <h3>Select a video file</h3>
                                        <p>Choose a video file from your computer</p>
                                        <button 
                                            className="upload-video-select-button"
                                            onClick={handleSelectFile}
                                        >
                                            Choose File
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Video Preview */}
                                    <div className="upload-video-preview">
                                        <video 
                                            ref={videoPreviewRef}
                                            src={videoPreviewUrl}
                                            controls
                                            className="upload-video-preview-video"
                                        />
                                    </div>

                                    {/* File Name Input */}
                                    <div className="upload-video-filename-input">
                                        <label htmlFor="targetFileName">Target File Name</label>
                                        <input
                                            id="targetFileName"
                                            type="text"
                                            value={targetFileName}
                                            onChange={(e) => setTargetFileName(e.target.value)}
                                            placeholder="Enter file name (without extension)"
                                            disabled={isUploading}
                                        />
                                        <p className="upload-video-filename-hint">
                                            This will be the name in your Zoom folder: <strong>{targetFileName || 'filename'}.{selectedFileName?.split('.').pop() || 'mp4'}</strong>
                                        </p>
                                    </div>

                                    {/* Upload Status */}
                                    {isUploading && (
                                        <div className="upload-video-status upload-video-status-loading">
                                            <div className="upload-video-loading-spinner">
                                                <svg className="upload-video-spinner-svg" viewBox="0 0 50 50">
                                                    <circle
                                                        className="upload-video-spinner-circle"
                                                        cx="25"
                                                        cy="25"
                                                        r="20"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="4"
                                                    />
                                                </svg>
                                            </div>
                                            <p>Uploading to local Zoom folder...</p>
                                        </div>
                                    )}

                                    {uploadStatus === 'success' && (
                                        <div className="upload-video-status upload-video-status-success">
                                            <div className="upload-video-success-icon">
                                                <svg className="upload-video-checkmark" viewBox="0 0 52 52">
                                                    <circle className="upload-video-checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                                                    <path className="upload-video-checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                                                </svg>
                                            </div>
                                            <p>Video uploaded successfully!</p>
                                        </div>
                                    )}

                                    {uploadStatus === 'error' && (
                                        <div className="upload-video-status upload-video-status-error">
                                            <div className="upload-video-error-icon">
                                                <svg className="upload-video-x-mark" viewBox="0 0 52 52">
                                                    <circle className="upload-video-x-circle" cx="26" cy="26" r="25" fill="none"/>
                                                    <path className="upload-video-x-line upload-video-x-line1" fill="none" d="M16 16 36 36"/>
                                                    <path className="upload-video-x-line upload-video-x-line2" fill="none" d="M36 16 16 36"/>
                                                </svg>
                                            </div>
                                            <p>{errorMessage || 'Failed to upload video'}</p>
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    {!isUploading && uploadStatus !== 'success' && (
                                        <div className="upload-video-actions">
                                            <button 
                                                className="upload-video-button upload-video-button-secondary"
                                                onClick={handleCloseModal}
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                className="upload-video-button upload-video-button-primary"
                                                onClick={handleUpload}
                                                disabled={!targetFileName.trim()}
                                            >
                                                Upload
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
