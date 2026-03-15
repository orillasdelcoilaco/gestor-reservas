import { useState } from 'react'
import axios from 'axios'
import { Upload, History, Share2, X, ChevronDown, ChevronUp, Cpu, Trash2 } from 'lucide-react'

const DOC_TITLES = {
    PADRON: 'Padrón del Vehículo',
    REVISION_TECNICA: 'Revisión Técnica',
    SOAP: 'Seguro Obligatorio (SOAP)',
    PERMISO_CIRCULACION: 'Permiso de Circulación',
    // aliases legacy
    REVISION: 'Revisión Técnica',
    PERMISO: 'Permiso de Circulación'
}

const SUMMARY_FIELDS = {
    PADRON: ['patente', 'propietario', 'marca', 'modelo', 'numeroChasis'],
    REVISION_TECNICA: ['patente', 'resultado', 'issueDate', 'expiryDate'],
    SOAP: ['patente', 'aseguradora', 'expiryDate'],
    PERMISO_CIRCULACION: ['patente', 'municipalidad', 'expiryDate'],
    REVISION: ['patente', 'resultado', 'issueDate', 'expiryDate'],
    PERMISO: ['patente', 'municipalidad', 'expiryDate']
}

const FIELD_LABELS = {
    patente: 'Patente',
    propietario: 'Propietario',
    ownerName: 'Propietario',
    marca: 'Marca',
    modelo: 'Modelo',
    vin: 'VIN/Chasis',
    numeroChasis: 'Chasis/VIN',
    resultado: 'Resultado',
    result: 'Resultado',
    aseguradora: 'Aseguradora',
    company: 'Aseguradora',
    municipalidad: 'Municipalidad',
    municipality: 'Municipalidad',
    issueDate: 'Emisión',
    expiryDate: 'Vencimiento'
}

// Calcula status dinámico
function calcStatus(doc) {
    if (!doc) return null
    if (!doc.expiryDate) return 'permanent'
    const days = Math.floor((new Date(doc.expiryDate) - new Date()) / 86400000)
    if (days < 0) return 'expired'
    if (days <= 30) return 'about_to_expire'
    return 'active'
}

const STATUS_STYLES = {
    active: 'bg-green-100 text-green-700',
    permanent: 'bg-blue-100 text-blue-700',
    about_to_expire: 'bg-yellow-100 text-yellow-700',
    expired: 'bg-red-100 text-red-600'
}

const STATUS_LABELS = {
    active: 'Vigente',
    permanent: 'Sin vencimiento',
    about_to_expire: 'Por vencer',
    expired: 'Vencido'
}

const DocumentCard = ({ type, doc, vehicleId, onUpload, onDeleted }) => {
    const [showFull, setShowFull] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [history, setHistory] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [showAiComparison, setShowAiComparison] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async () => {
        setDeleting(true)
        try {
            const token = localStorage.getItem('firebaseIdToken')
            await axios.delete(`/api/vehicle-docs/vehicles/${vehicleId}/documents/${type}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setShowDeleteConfirm(false)
            if (onDeleted) onDeleted(type)
        } catch (e) {
            alert('Error al eliminar: ' + (e.response?.data?.error || e.message))
        } finally {
            setDeleting(false)
        }
    }

    const status = calcStatus(doc)

    // Lectura de datos con degradación graceful hacia atrás
    const getField = (field) =>
        doc?.reviewedData?.[field] ??
        doc?.data?.[field] ??
        doc?.metadata?.[field] ??
        doc?.[field] ??
        null

    const fields = SUMMARY_FIELDS[type] || []
    const hasExtractedData = doc?.extractedData && JSON.stringify(doc.extractedData) !== JSON.stringify(doc.reviewedData || doc.data)

    const loadHistory = async () => {
        if (showHistory) { setShowHistory(false); return }
        setLoadingHistory(true)
        try {
            const res = await axios.get(`/api/vehicle-docs/vehicles/${vehicleId}/documents/${type}/history`, {
                withCredentials: true
            })
            setHistory(res.data.history || [])
            setShowHistory(true)
        } catch (e) {
            console.error('Error cargando historial:', e)
        } finally {
            setLoadingHistory(false)
        }
    }

    const processingVersion = doc?.processingMetadata?.version

    const frontSrc = doc?.images?.color || doc?.images?.processed || doc?.frontUrl || doc?.previewUrl || doc?.fileUrl
    const backSrc = doc?.images?.back

    return (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">

            {/* Franja de imagen(s) arriba — igual para todos los tipos */}
            {doc && (frontSrc || backSrc) && (
                <div className="w-full bg-gray-50 border-b border-gray-100 flex divide-x divide-gray-100 overflow-hidden" style={{ height: '140px' }}>
                    {[
                        { src: frontSrc, label: type === 'PADRON' ? 'Frente' : null },
                        ...(type === 'PADRON' ? [{ src: backSrc, label: 'Reverso' }] : [])
                    ].map(({ src, label }, i) => (
                        <div
                            key={i}
                            className="flex-1 relative group cursor-pointer overflow-hidden"
                            onClick={() => src && setShowFull(src)}
                        >
                            {src ? (
                                <>
                                    <img src={src} alt={label || type} className="w-full h-full object-contain transition-all duration-300 group-hover:brightness-75" />
                                    {label && (
                                        <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black text-white bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded uppercase tracking-widest">
                                            {label}
                                        </span>
                                    )}
                                    <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-white font-bold text-[8px] bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm uppercase tracking-widest">Ampliar</span>
                                    </div>
                                </>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                                    <Upload className="w-5 h-5 opacity-20 mb-1" />
                                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">{label}</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="flex flex-col md:flex-row min-h-[180px]">
                {/* Sin panel lateral de imagen — todas van arriba */}

                {/* Datos principales */}
                <div className="flex-1 p-6 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="text-xl font-black text-gray-900">{DOC_TITLES[type] || type}</h4>
                            {doc && status && (
                                <div className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[status]}`}>
                                    {STATUS_LABELS[status]}
                                </div>
                            )}
                            {processingVersion && processingVersion !== 'V1' && (
                                <div className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-100 text-indigo-600 flex items-center gap-1">
                                    <Cpu className="w-2.5 h-2.5" />
                                    {processingVersion}
                                </div>
                            )}
                        </div>

                        {!doc ? (
                            <p className="text-gray-400 text-sm font-medium">No se ha cargado este documento.</p>
                        ) : (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4">
                                {fields.map(field => {
                                    const val = getField(field)
                                    if (!val) return null
                                    const isExpired = field === 'expiryDate' && status === 'expired'
                                    return (
                                        <div key={field}>
                                            <span className="block text-[9px] text-gray-400 font-black uppercase tracking-widest mb-0.5">
                                                {FIELD_LABELS[field] || field}
                                            </span>
                                            <span className={`font-bold text-gray-700 ${isExpired ? 'text-red-600' : ''}`}>
                                                {val}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* QR */}
                    {(doc?.images?.qr || doc?.qrUrl) && (
                        <div className="w-full md:w-44 flex flex-col items-center justify-center bg-white rounded-2xl p-3 border border-indigo-100 shadow-sm">
                            <div
                                className="w-full aspect-square bg-white rounded-xl overflow-hidden border border-gray-100 flex items-center justify-center mb-2 cursor-pointer group relative"
                                onClick={() => setShowFull(doc.images?.qr || doc.qrUrl)}
                            >
                                <img src={doc.images?.qr || doc.qrUrl} alt="QR Code" className="w-full h-full object-contain p-1 transition-all group-hover:brightness-75" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-white font-bold text-xs bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">Ampliar</span>
                                </div>
                            </div>
                            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">QR DETECTADO</span>
                        </div>
                    )}
                </div>

                {/* Acciones laterales */}
                <div className="bg-gray-50/50 p-4 flex md:flex-col gap-2 border-l border-gray-100 min-w-[120px]">
                    <button
                        onClick={loadHistory}
                        disabled={loadingHistory}
                        className="flex-1 flex flex-col items-center justify-center p-2 rounded-xl hover:bg-white transition-all text-gray-400 hover:text-indigo-600 disabled:opacity-50"
                    >
                        <History className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-black uppercase tracking-widest">
                            {loadingHistory ? '...' : 'Historial'}
                        </span>
                    </button>
                    <button
                        onClick={() => onUpload(type)}
                        className="flex-1 flex flex-col items-center justify-center p-2 rounded-xl hover:bg-white transition-all text-gray-400 hover:text-indigo-600"
                    >
                        <Upload className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{doc ? 'Renovar' : 'Subir'}</span>
                    </button>
                    <button
                        onClick={() => doc && setShowFull(imgSrcNonPadron || doc.images?.color || doc.images?.processed || doc.fileUrl || doc.previewUrl)}
                        className="flex-1 flex flex-col items-center justify-center p-2 rounded-xl hover:bg-white transition-all text-gray-400 hover:text-indigo-600"
                    >
                        <Share2 className="w-5 h-5 mb-1" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Ver Todo</span>
                    </button>
                    {doc && (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex-1 flex flex-col items-center justify-center p-2 rounded-xl hover:bg-red-50 transition-all text-gray-300 hover:text-red-500"
                        >
                            <Trash2 className="w-5 h-5 mb-1" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Borrar</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Comparación IA vs Revisado (colapsable) */}
            {hasExtractedData && (
                <div className="border-t border-gray-100">
                    <button
                        onClick={() => setShowAiComparison(!showAiComparison)}
                        className="w-full px-6 py-2 flex items-center gap-2 text-indigo-500 hover:bg-indigo-50 transition-all text-xs font-bold"
                    >
                        <Cpu className="w-3.5 h-3.5" />
                        Comparar datos IA vs revisados
                        {showAiComparison ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                    {showAiComparison && (
                        <div className="px-6 pb-4 grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Extraído por IA</p>
                                <pre className="text-[10px] text-gray-600 bg-gray-50 rounded-xl p-3 overflow-auto max-h-48">
                                    {JSON.stringify(doc.extractedData, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Confirmado por usuario</p>
                                <pre className="text-[10px] text-gray-600 bg-gray-50 rounded-xl p-3 overflow-auto max-h-48">
                                    {JSON.stringify(doc.reviewedData || doc.data, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Historial (colapsable) */}
            {showHistory && (
                <div className="border-t border-gray-100 px-6 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Historial de documentos</p>
                    {history.length === 0 ? (
                        <p className="text-sm text-gray-400">Sin historial anterior.</p>
                    ) : (
                        <div className="space-y-2">
                            {history.map((h, i) => (
                                <div key={h.id} className={`flex items-center gap-4 p-3 rounded-xl ${i === 0 ? 'bg-green-50 border border-green-100' : 'bg-gray-50'}`}>
                                    <div className="flex-1">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${i === 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {i === 0 ? 'Actual' : 'Anterior'}
                                        </span>
                                        <p className="text-xs text-gray-600 font-medium mt-0.5">
                                            Emisión: {h.issueDate ? new Date(h.issueDate).toLocaleDateString('es-CL') : '—'}
                                        </p>
                                        {h.expiryDate && (
                                            <p className="text-xs text-gray-500">
                                                Vencimiento: {new Date(h.expiryDate).toLocaleDateString('es-CL')}
                                            </p>
                                        )}
                                    </div>
                                    {(h.images?.color || h.images?.processed) && (
                                        <img src={h.images.color || h.images.processed} alt="doc" className="w-12 h-12 object-cover rounded-lg" />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal confirmación borrado */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                    <div className="bg-white rounded-[32px] p-10 max-w-sm w-full text-center shadow-2xl">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-5">
                            <Trash2 className="w-7 h-7" />
                        </div>
                        <h3 className="text-xl font-black text-gray-900 mb-2">¿Borrar documento?</h3>
                        <p className="text-gray-500 font-medium mb-8">
                            Se eliminará <b>{DOC_TITLES[type] || type}</b> y todo su historial de forma permanente.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all disabled:bg-gray-200"
                            >
                                {deleting ? 'Eliminando...' : 'Sí, eliminar permanentemente'}
                            </button>
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="w-full py-4 text-gray-400 font-black uppercase tracking-widest text-xs hover:text-gray-900"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal imagen completa */}
            {showFull && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-lg" onClick={() => setShowFull(false)}>
                    <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
                        <button className="absolute top-0 right-0 text-white/50 hover:text-white p-4">
                            <X className="w-10 h-10" />
                        </button>
                        <img src={showFull} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" alt="Full view" />
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                            <a href={showFull} download={`${type}-${vehicleId}.jpg`} className="bg-white text-black px-6 py-2 rounded-full font-bold hover:bg-gray-200 transition-all">
                                Descargar
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default DocumentCard
