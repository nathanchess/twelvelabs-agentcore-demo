export default function VideoPlayer({ hash }) {
    
    const getVideoContent = async () => await window.api.getVideoContent(hash);
    const videoContent = getVideoContent();

    return (
        <div className="video-player">
            <video src={videoContent.hlsUrl} controls />
        </div>
    )
}