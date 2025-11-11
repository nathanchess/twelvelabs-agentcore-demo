import { useState, useEffect } from 'react'

export default function AccountInformation() {
    const [twelveLabsApiKey, setTwelveLabsApiKey] = useState('')
    const [slackBotToken, setSlackBotToken] = useState('')
    const [slackAppToken, setSlackAppToken] = useState('')
    const [saveStatus, setSaveStatus] = useState('')

    // Load saved tokens on component mount
    useEffect(() => {
        const savedTwelveLabsKey = localStorage.getItem('TWELVELABS_API_KEY') || ''
        const savedSlackBotToken = localStorage.getItem('SLACK_BOT_TOKEN') || ''
        const savedSlackAppToken = localStorage.getItem('SLACK_APP_TOKEN') || ''
        
        setTwelveLabsApiKey(savedTwelveLabsKey)
        setSlackBotToken(savedSlackBotToken)
        setSlackAppToken(savedSlackAppToken)
    }, [])

    const handleSave = () => {
        localStorage.setItem('TWELVELABS_API_KEY', twelveLabsApiKey)
        localStorage.setItem('SLACK_BOT_TOKEN', slackBotToken)
        localStorage.setItem('SLACK_APP_TOKEN', slackAppToken)
        
        setSaveStatus('Settings saved successfully!')
        setTimeout(() => setSaveStatus(''), 3000)
    }

    return (
        <div className="account-information">
            <div className="account-information-header">
                <h1 className="account-information-title">Account Information</h1>
                <p className="account-information-subtitle">
                    Configure your API keys and tokens to enable advanced features
                </p>
            </div>

            <div className="account-information-content">
                <div className="account-section">
                    <div className="account-section-header">
                        <h2 className="account-section-title">TwelveLabs API Key</h2>
                        <span className="account-section-optional"></span>
                    </div>
                    <p className="account-section-description">
                        Your TwelveLabs API key enables the Strands Agent to upload your videos into the 'strands-dev' index 
                        in your own TwelveLabs account for video archive and analysis. This allows you to search, analyze, 
                        and extract insights from your video recordings.
                    </p>
                    <input
                        type="password"
                        className="account-input"
                        placeholder="Enter your TwelveLabs API Key"
                        value={twelveLabsApiKey}
                        onChange={(e) => setTwelveLabsApiKey(e.target.value)}
                    />
                </div>

                <div className="account-section">
                    <div className="account-section-header">
                        <h2 className="account-section-title">Slack Bot Token</h2>
                        <span className="account-section-optional">(Optional)</span>
                    </div>
                    <p className="account-section-description">
                        The Slack Bot Token allows the Strands Agent to send notifications to your team members in Slack. 
                        This enables the agent to notify your team about follow-ups, to-dos, summaries, and other important 
                        information extracted from your video meetings.
                    </p>
                    <input
                        type="password"
                        className="account-input"
                        placeholder="Enter your Slack Bot Token"
                        value={slackBotToken}
                        onChange={(e) => setSlackBotToken(e.target.value)}
                    />
                </div>

                <div className="account-section">
                    <div className="account-section-header">
                        <h2 className="account-section-title">Slack App Token</h2>
                        <span className="account-section-optional">(Optional)</span>
                    </div>
                    <p className="account-section-description">
                        The Slack App Token works together with the Bot Token to enable the Strands Agent to interact with 
                        your Slack workspace. This allows the agent to post messages, create channels, and manage notifications 
                        for your team's follow-ups, to-dos, and summaries.
                    </p>
                    <input
                        type="password"
                        className="account-input"
                        placeholder="Enter your Slack App Token"
                        value={slackAppToken}
                        onChange={(e) => setSlackAppToken(e.target.value)}
                    />
                </div>

                <div className="account-actions">
                    <button 
                        className="account-save-button"
                        onClick={handleSave}
                    >
                        Save Settings
                    </button>
                    {saveStatus && (
                        <span className="account-save-status">{saveStatus}</span>
                    )}
                </div>

                <div className="account-info-box">
                    <p className="account-info-text">
                        <strong>Note:</strong> All tokens are optional. The Strands Agent can still function without them, 
                        but enabling these tokens unlocks additional features like team notifications, video archiving, 
                        and advanced analysis capabilities.
                    </p>
                </div>
            </div>
        </div>
    )
}