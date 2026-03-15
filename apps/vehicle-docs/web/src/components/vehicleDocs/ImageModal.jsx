import { X } from 'lucide-react'

const ImageModal = ({ src, onClose }) => {
    if (!src) return null
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4" onClick={onClose}>
            <button onClick={onClose} className="absolute top-4 right-4 text-white p-2 rounded-full hover:bg-white hover:bg-opacity-20 z-50 transition-colors">
                <X className="w-8 h-8" />
            </button>
            <img src={src} alt="Zoom" className="max-w-full max-h-screen object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
    )
}

export default ImageModal
