import { useState, useEffect } from 'react'
import axios from 'axios'
import { Car, ChevronRight, Trash2, RefreshCw, X } from 'lucide-react'
import DocumentCard from './DocumentCard'
import AiDocumentUpload from './AiDocumentUpload'
import PadronDualUpload from './PadronDualUpload'

const DOC_UPLOAD_META = {
    PADRON: { title: 'Padrón del Vehículo', description: 'Sube el frente del Padrón. La IA extraerá los datos automáticamente.' },
    REVISION: { title: 'Revisión Técnica', description: 'Sube el certificado vigente.' },
    SOAP: { title: 'Seguro Obligatorio (SOAP)', description: 'Sube la póliza del seguro obligatorio.' },
    PERMISO: { title: 'Permiso de Circulación', description: 'Sube el permiso de la municipalidad.' }
}

const VehicleDetailView = ({ vehicleId, onBack, onContinue }) => {
    const [vehicle, setVehicle] = useState(null)
    const [docs, setDocs] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [uploadingDocType, setUploadingDocType] = useState(null)

const handleDocUpload = async (files, data) => {
        try {
            const token = localStorage.getItem('firebaseIdToken')
            const formData = new FormData()
            formData.append('vehicleId', vehicleId)
            formData.append('type', uploadingDocType)
            formData.append('data', JSON.stringify(data))
            if (data.issueDate) formData.append('issueDate', data.issueDate)
            if (data.expiryDate) formData.append('expiryDate', data.expiryDate)

            if (uploadingDocType === 'PADRON') {
                // PadronDualUpload returns { front, back, qrFile }
                if (files.front)  formData.append('file', files.front)
                if (files.back)   formData.append('fileBack', files.back)
                if (files.qrFile) formData.append('qrFile', files.qrFile)
            } else {
                // AiDocumentUpload returns { file, qrFile }
                if (files.file) formData.append('file', files.file)
                if (files.qrFile) formData.append('qrFile', files.qrFile)
            }

            await axios.post('/api/vehicle-docs/documents', formData, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setUploadingDocType(null)
            fetchData()
        } catch (err) {
            alert('Error al guardar documento: ' + err.message)
        }
    }

    useEffect(() => {
        fetchData()
    }, [vehicleId])

    const fetchData = async () => {
        setLoading(true)
        setError(null)
        try {
            const token = localStorage.getItem('firebaseIdToken')
            const [vRes, dRes] = await Promise.all([
                axios.get(`/api/vehicle-docs/vehicles/${vehicleId}`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`/api/vehicle-docs/documents?vehicleId=${vehicleId}`, { headers: { Authorization: `Bearer ${token}` } })
            ])
            setVehicle(vRes.data.vehicle || vRes.data)
            setDocs(Array.isArray(dRes.data) ? dRes.data : [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            const token = localStorage.getItem('firebaseIdToken')
            await axios.delete(`/api/vehicle-docs/vehicles/${vehicleId}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            onBack()
        } catch (err) {
            alert('Error al eliminar: ' + err.message)
        } finally {
            setDeleting(false)
        }
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 text-gray-400">
            <RefreshCw className="w-12 h-12 animate-spin mb-4 opacity-20" />
            <p className="font-black uppercase tracking-widest text-xs">Cargando detalles...</p>
        </div>
    )

    if (error || !vehicle) return <div className="p-20 text-center text-red-500 font-bold">{error || 'Vehículo no encontrado'}</div>

    return (
        <div className="max-w-5xl mx-auto pb-16 px-3 md:px-4">
            {/* Header / Navigation */}
            <div className="flex items-center justify-between mb-5 pt-4 md:mb-8 md:pt-6">
                <button onClick={onBack} className="flex items-center text-gray-500 hover:text-indigo-600 font-black uppercase tracking-widest text-xs transition-all">
                    <ChevronRight className="w-4 h-4 mr-1 rotate-180" /> Volver al dashboard
                </button>
            </div>

            {/* Vehículo Hero Section */}
            <div className="bg-white rounded-3xl md:rounded-[40px] shadow-xl md:shadow-2xl border border-gray-100 overflow-hidden mb-6 md:mb-10 flex flex-col md:flex-row">
                <div className="w-full md:w-[400px] h-[200px] md:h-auto bg-gray-100 relative group overflow-hidden">
                    {(vehicle.photoUrl || vehicle.photoURL) ? (
                        <img src={vehicle.photoUrl || vehicle.photoURL} alt={vehicle.patente} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                            <Car className="w-20 h-20 mb-4 opacity-10" />
                            <span className="font-black uppercase tracking-widest text-[10px]">Sin foto del vehículo</span>
                        </div>
                    )}
                    <div className="absolute top-6 left-6">
                        <div className="bg-black/60 backdrop-blur-xl px-4 py-1.5 rounded-full text-white text-xs font-black uppercase tracking-[0.2em] border border-white/20">
                            {vehicle.anio}
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-5 md:p-10 flex flex-col justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="bg-indigo-600 text-white px-3 py-1 md:px-4 md:py-1.5 rounded-2xl font-black text-xl md:text-2xl shadow-lg shadow-indigo-100 uppercase">
                                {vehicle.patente}
                            </span>
                            <div className="px-3 py-1 bg-gray-100 rounded-lg text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {vehicle.marca} {vehicle.modelo}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 md:gap-8 mt-4 md:mt-10">
                            <div>
                                <span className="block text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Chasis / VIN</span>
                                <span className="text-sm md:text-xl font-bold text-gray-800 tracking-tight break-all">{vehicle.vin || '—'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Color</span>
                                <span className="text-sm md:text-xl font-bold text-gray-800 tracking-tight">{vehicle.color || '—'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 mt-6 pt-5 border-t border-gray-50 md:mt-12 md:pt-8 md:gap-4">
                        <button
                            onClick={() => onContinue(vehicle)}
                            className="flex-1 bg-gray-900 text-white py-3 md:py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-black transition-all shadow-xl shadow-gray-200"
                        >
                            Actualizar Documentos
                        </button>
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-12 h-12 md:w-14 md:h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shrink-0"
                        >
                            <Trash2 className="w-5 h-5 md:w-6 md:h-6" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Listado de Documentos */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <h3 className="text-2xl font-black text-gray-900">Documentación</h3>
                    <div className="bg-green-50 text-green-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-100">
                        {docs.length} de 4 documentos cargados
                    </div>
                </div>

                {['PADRON', 'REVISION', 'SOAP', 'PERMISO'].map(type => (
                    <DocumentCard
                        key={type}
                        type={type}
                        doc={docs.find(d => d.type === type)}
                        vehicleId={vehicleId}
                        onUpload={(t) => setUploadingDocType(t)}
                        onDeleted={() => fetchData()}
                    />
                ))}
            </div>

            {/* Modal de carga de documento individual */}
            {uploadingDocType && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
                    <div className="bg-white rounded-[32px] w-full max-w-2xl shadow-2xl my-4">
                        <div className="flex items-center justify-between px-5 pt-5 pb-3 md:px-8 md:pt-8 md:pb-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-base md:text-xl font-black text-gray-900">{DOC_UPLOAD_META[uploadingDocType]?.title}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{vehicle.patente} · {vehicle.marca} {vehicle.modelo}</p>
                            </div>
                            <button onClick={() => setUploadingDocType(null)} className="text-gray-300 hover:text-gray-600 transition-colors ml-3">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-4 md:p-8">
                            {uploadingDocType === 'PADRON' ? (
                                <PadronDualUpload
                                    onVerified={handleDocUpload}
                                    onCancel={() => setUploadingDocType(null)}
                                />
                            ) : (
                                <AiDocumentUpload
                                    type={uploadingDocType}
                                    title={DOC_UPLOAD_META[uploadingDocType]?.title}
                                    description={DOC_UPLOAD_META[uploadingDocType]?.description}
                                    onVerified={handleDocUpload}
                                    skip={() => setUploadingDocType(null)}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de eliminación */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
                    <div className="bg-white rounded-[32px] p-10 max-w-sm w-full text-center shadow-2xl">
                        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 scale-110">
                            <Trash2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-2xl font-black text-gray-900 mb-2">¿Eliminar Vehículo?</h3>
                        <p className="text-gray-500 font-medium mb-10">Esta acción eliminará permanentemente la patente <b>{vehicle.patente}</b> y toda su documentación.</p>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:bg-gray-200"
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
        </div>
    )
}

export default VehicleDetailView
