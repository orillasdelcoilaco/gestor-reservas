import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'

const FilePreview = ({ file, onZoom }) => {
    const [previewUrl, setPreviewUrl] = useState(null)

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null)
            return
        }
        const objectUrl = URL.createObjectURL(file)
        setPreviewUrl(objectUrl)
        return () => URL.revokeObjectURL(objectUrl)
    }, [file])

    if (!file) return null

    const isPdf = file.type === 'application/pdf'

    return (
        <div className="mt-4 mb-2 relative group">
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100 flex justify-center items-center h-48 relative">
                {isPdf ? (
                    <div className="text-center text-gray-500">
                        <FileText className="w-12 h-12 mx-auto mb-2" />
                        <span className="text-xs">{file.name}</span>
                    </div>
                ) : (
                    <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
                )}

                {/* Zoom Overlay (Images only) */}
                {!isPdf && (
                    <button
                        onClick={(e) => { e.preventDefault(); onZoom(previewUrl); }}
                        className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center pointer-events-none group-hover:pointer-events-auto"
                    >
                        <div className="bg-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all cursor-pointer">
                            <span className="text-xs font-bold text-gray-700 block">Ampliar 🔍</span>
                        </div>
                    </button>
                )}
            </div>
            {isPdf ? <p className="text-xs text-center text-gray-400 mt-1">Vista previa no disponible para PDF</p> : <p className="text-xs text-center text-gray-400 mt-1">Click para ampliar</p>}
        </div>
    )
}

export default FilePreview
