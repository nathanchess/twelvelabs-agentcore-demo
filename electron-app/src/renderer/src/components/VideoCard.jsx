export default function VideoCard({ thumbnail, title, date }) {
    // Format date if it's a Date object, otherwise use as string
    const formattedDate = date 
        ? (date instanceof Date 
            ? date.toLocaleDateString() 
            : String(date))
        : '';

    return (
        <div className="shrink-0 w-64 bg-white rounded-lg shadow-md overflow-hidden">
            <img src={thumbnail} alt={title} className="w-full h-40 object-cover" />
            <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-800 truncate">{title}</h3>
                {formattedDate && (
                    <p className="text-sm text-gray-500">{formattedDate}</p>
                )}
            </div>
        </div>
    )
}