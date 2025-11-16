import { useState, useRef, useEffect } from 'react'

// Simple markdown renderer for chat messages
const renderMarkdown = (text) => {
    if (!text) return ''
    
    // First, convert literal \n strings to actual newlines
    let processed = text.replace(/\\n/g, '\n')
    
    // Escape HTML first to prevent XSS
    const escapeHtml = (str) => {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
    }
    
    // Split into lines to process headers
    const lines = processed.split('\n')
    let html = ''
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim()
        
        // Skip empty lines (will be handled as paragraph breaks)
        if (!line) {
            if (i < lines.length - 1 && lines[i + 1]?.trim()) {
                html += '</p><p>'
            }
            continue
        }
        
        // Process headers (must be at start of line)
        if (line.startsWith('### ')) {
            let headerText = line.substring(4)
            // Process markdown in headers
            headerText = escapeHtml(headerText)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            html += `<h3>${headerText}</h3>`
            continue
        } else if (line.startsWith('## ')) {
            let headerText = line.substring(3)
            // Process markdown in headers
            headerText = escapeHtml(headerText)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            html += `<h2>${headerText}</h2>`
            continue
        } else if (line.startsWith('# ')) {
            let headerText = line.substring(2)
            // Process markdown in headers
            headerText = escapeHtml(headerText)
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            html += `<h2>${headerText}</h2>`
            continue
        }
        
        // Escape the line
        let lineHtml = escapeHtml(line)
        
        // Process markdown within the line - order matters!
        // First handle code blocks (to avoid processing markdown inside code)
        lineHtml = lineHtml.replace(/`([^`]+)`/g, '<code>$1</code>')
        
        // Then handle bold (**text** or __text__) - must come before italic
        lineHtml = lineHtml.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        lineHtml = lineHtml.replace(/__([^_]+)__/g, '<strong>$1</strong>')
        
        // Then handle italic (*text* or _text_) - simple pattern after bold is processed
        lineHtml = lineHtml.replace(/\*([^*]+)\*/g, '<em>$1</em>')
        lineHtml = lineHtml.replace(/_([^_]+)_/g, '<em>$1</em>')
        
        // Handle list items (numbered or bulleted)
        if (line.match(/^\d+\.\s/)) {
            const match = line.match(/^(\d+\.\s)(.+)$/)
            if (match) {
                const content = escapeHtml(match[2])
                let listContent = content
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
                html += `<div class="chat-list-item"><strong>${match[1]}</strong>${listContent}</div>`
            }
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
            const marker = line.substring(0, 2)
            const content = escapeHtml(line.substring(2))
            let listContent = content
                .replace(/`([^`]+)`/g, '<code>$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            html += `<div class="chat-list-item">• ${listContent}</div>`
        } else {
            // Regular paragraph line
            if (!html || html.endsWith('</p>') || html.endsWith('</h2>') || html.endsWith('</h3>') || html.endsWith('</div>')) {
                html += '<p>'
            }
            html += lineHtml
            // Add line break if not last line and next line is not empty and not a header/list
            if (i < lines.length - 1 && lines[i + 1]?.trim() && !lines[i + 1].trim().match(/^[#\d-*]/)) {
                html += '<br>'
            }
        }
    }
    
    // Close any open paragraph
    if (html && !html.endsWith('</p>') && !html.endsWith('</h2>') && !html.endsWith('</h3>') && !html.endsWith('</div>')) {
        html += '</p>'
    }
    
    // Wrap in container if needed
    if (!html.startsWith('<')) {
        html = `<p>${html}</p>`
    }
    
    return html || '<p></p>'
}

export default function AgentChat({ videoId }) {

    const [messages, setMessages] = useState([
        {
            id: 1,
            role: 'assistant',
            content: 'Hello! I\'m your Strands Agent. Ask me anything about this video, and I can help you navigate, summarize, or find specific moments.',
            timestamp: new Date()
        }
    ])

    const [inputValue, setInputValue] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isTyping, setIsTyping] = useState(false)
    const messagesEndRef = useRef(null)
    const inputRef = useRef(null)
    const currentAssistantMessageIdRef = useRef(null)
    const responseHandlersRef = useRef({ response: null, complete: null, error: null })

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    useEffect(() => {
        scrollToBottom()
    }, [messages, isTyping])

    const handleSend = async () => {
        if (!inputValue.trim() || isLoading) return

        const userMessage = {
            id: Date.now(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date()
        }

        setMessages(prev => [...prev, userMessage])
        setInputValue('')
        setIsLoading(true)
        setIsTyping(true)

        const twelveLabsApiKey = localStorage.getItem('TWELVELABS_API_KEY')
        const slack_bot_token = localStorage.getItem('SLACK_BOT_TOKEN')
        const slack_app_token = localStorage.getItem('SLACK_APP_TOKEN')

        // Clean up any existing listeners first - remove ALL listeners for these events
        window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-response')
        window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-complete')
        window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-error')

        // Create assistant message placeholder for streaming
        const assistantMessageId = Date.now() + 1
        currentAssistantMessageIdRef.current = assistantMessageId
        const assistantMessage = {
            id: assistantMessageId,
            role: 'assistant',
            content: '',
            timestamp: new Date()
        }
        setMessages(prev => [...prev, assistantMessage])

        // Set up event listeners with proper closure over messageId
        const handleResponse = (event, chunk) => {
            // Only process if this chunk is for the current message
            const currentMessageId = currentAssistantMessageIdRef.current
            if (!currentMessageId || currentMessageId !== assistantMessageId) {
                console.log('Ignoring chunk for old message:', currentMessageId, assistantMessageId)
                return
            }
            
            setIsTyping(false)
            setMessages(prev => {
                // Find the assistant message and update only that one
                const messageIndex = prev.findIndex(msg => msg.id === assistantMessageId)
                if (messageIndex !== -1) {
                    const updated = [...prev]
                    updated[messageIndex] = {
                        ...updated[messageIndex],
                        content: updated[messageIndex].content + chunk
                    }
                    return updated
                }
                return prev
            })
        }

        const handleComplete = () => {
            // Only process if this completion is for the current message
            const currentMessageId = currentAssistantMessageIdRef.current
            if (currentMessageId !== assistantMessageId) {
                console.log('Ignoring complete for old message')
                return
            }
            
            console.log('Strands Agent complete')
            setIsLoading(false)
            setIsTyping(false)
            currentAssistantMessageIdRef.current = null
            
            // Clean up listeners
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-response')
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-complete')
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-error')
            responseHandlersRef.current = { response: null, complete: null, error: null }
        }

        const handleError = (event, errorMsg) => {
            // Only process if this error is for the current message
            const currentMessageId = currentAssistantMessageIdRef.current
            if (currentMessageId !== assistantMessageId) {
                console.log('Ignoring error for old message')
                return
            }
            
            console.error('Strands Agent error:', errorMsg)
            setIsLoading(false)
            setIsTyping(false)
            currentAssistantMessageIdRef.current = null
            
            setMessages(prev => prev.map(msg => 
                msg.id === assistantMessageId 
                    ? { ...msg, content: msg.content || 'Error: ' + errorMsg }
                    : msg
            ))
            
            // Clean up listeners
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-response')
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-complete')
            window.electron.ipcRenderer.removeAllListeners('prompt-strands-agent-error')
            responseHandlersRef.current = { response: null, complete: null, error: null }
        }

        // Store handlers in ref
        responseHandlersRef.current = {
            response: handleResponse,
            complete: handleComplete,
            error: handleError
        }

        // Register listeners
        window.electron.ipcRenderer.on('prompt-strands-agent-response', handleResponse)
        window.electron.ipcRenderer.on('prompt-strands-agent-complete', handleComplete)
        window.electron.ipcRenderer.on('prompt-strands-agent-error', handleError)

        // Call the agent
        try {
            await window.api.promptStrandsAgent(
                userMessage.content, 
                twelveLabsApiKey, 
                slack_bot_token, 
                slack_app_token, 
                messages, 
                videoId
            )
        } catch (error) {
            console.error('Error calling Strands Agent:', error)
            handleError(null, error.message || 'Failed to connect to Strands Agent')
        }
    }

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto'
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
        }
    }, [inputValue])


    return (
        <div className="agent-chat">
            <div className="agent-chat-header">
                <div className="agent-chat-header-content">
                    <div className="agent-chat-title">Strands Agent</div>
                    <div className="agent-chat-subtitle">Ask questions about this video</div>
                </div>
                <div className="agent-chat-status">
                    <div className="agent-chat-status-dot"></div>
                    <span>Ready</span>
                </div>
            </div>

            <div className="agent-chat-messages">
                {messages.map((message) => (
                    (
                        message.content.length > 0 && (
                            <div
                        key={message.id}
                        className={`agent-chat-message agent-chat-message-${message.role}`}
                    >
                        <div 
                            className="agent-chat-message-content"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                        />
                        <div className="agent-chat-message-time">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                    )
                    )
                    
                ))}
                
                {isTyping && (
                    <div className="agent-chat-message agent-chat-message-assistant agent-chat-message-typing">
                        <div className="agent-chat-message-content">
                            <div className="agent-chat-typing-indicator">
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                )}

                {isLoading && !isTyping && (
                    <div className="agent-chat-loading">
                        <div className="agent-chat-loading-line"></div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            <div className="agent-chat-input-container">
                <div className="agent-chat-input-wrapper">
                    <textarea
                        ref={inputRef}
                        className="agent-chat-input"
                        placeholder="Ask about the video content..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyPress={handleKeyPress}
                        rows={1}
                        disabled={isLoading}
                    />
                    <button
                        className="agent-chat-send-button"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}
