import { useState, useEffect } from 'react'
import axios from 'axios'
import { Car, ChevronRight, AlertCircle, Check, Plus } from 'lucide-react'

const VehicleCard = ({ vehicle, onContinue, onDelete, onClick }) => {
    const [docs, setDocs] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchDocs()
    }, [vehicle.id])

    const fetchDocs = async () => {
        try {
            const token = localStorage.getItem('firebaseIdToken')
            const res = await axios.get(`/api/vehicle-docs/documents?vehicleId=${vehicle.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setDocs(Array.isArray(res.data) ? res.data : [])
        } catch (err) {
            console.error('Error fetching docs', err)
        } finally {
            setLoading(false)
        }
    }

    const getDocInfo = (type) => {
        const doc = docs.find(d => d.type === type)
        if (!doc) return { status: 'pending', expiryLabel: null }

        if (type === 'PADRON') return { status: 'valid', expiryLabel: null }

        // Buscar expiryDate en múltiples lugares (compatibilidad con docs antiguos)
        const rawExpiry = doc.expiryDate || doc.data?.expiryDate || doc.reviewedData?.expiryDate || doc.metadata?.expiryDate
        if (rawExpiry) {
            const exp = new Date(rawExpiry)
            if (isNaN(exp.getTime())) return { status: 'valid', expiryLabel: null }
            const now = new Date()
            const days = Math.floor((exp - now) / 86400000)
            const label = exp.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })
            if (days < 0) return { status: 'expired', expiryLabel: label }
            if (days <= 30) return { status: 'soon', expiryLabel: label }
            return { status: 'valid', expiryLabel: label }
        }
        return { status: 'valid', expiryLabel: null }
    }

    const docTypes = [
        { id: 'PADRON', label: 'PAD' },
        { id: 'REVISION', label: 'REV' },
        { id: 'SOAP', label: 'SOA' },
        { id: 'PERMISO', label: 'PER' }
    ]

    return (
        <div
            onClick={() => onClick(vehicle.id)}
            className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group"
        >
            {/* Foto del Vehículo */}
            <div className="w-full md:w-72 h-48 md:h-auto bg-gray-100 relative overflow-hidden">
                {(vehicle.photoUrl || vehicle.photoURL) ? (
                    <img src={vehicle.photoUrl || vehicle.photoURL} alt={vehicle.patente} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                        <Car className="w-10 h-10 mb-2 opacity-10" />
                        <span className="text-[8px] font-black uppercase tracking-widest">Sin foto</span>
                    </div>
                )}
                <div className="absolute top-4 left-4">
                    <div className="bg-black/50 backdrop-blur-md px-3 py-1 rounded-full text-white text-[9px] font-black uppercase tracking-widest border border-white/20">
                        {vehicle.anio}
                    </div>
                </div>
            </div>

            <div className="flex-1 p-8 flex flex-col justify-between">
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-2xl font-black text-2xl uppercase shadow-lg shadow-indigo-100">
                            {vehicle.patente}
                        </div>
                        <div className="flex items-center text-indigo-500 font-bold text-xs uppercase tracking-widest">
                            Ver reporte <ChevronRight className="w-4 h-4 ml-1" />
                        </div>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 leading-tight uppercase tracking-tight mb-1">
                        {vehicle.marca} <span className="text-gray-400 font-bold">{vehicle.modelo}</span>
                    </h3>
                    <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{vehicle.vin || 'VIN Pendiente'}</p>
                </div>

                <div className="mt-8">
                    <div className="flex gap-2">
                        {docTypes.map(dt => {
                            const { status, expiryLabel } = getDocInfo(dt.id)
                            return (
                                <div
                                    key={dt.id}
                                    className={`flex-1 py-2.5 px-1 rounded-2xl flex flex-col items-center justify-center border transition-all ${
                                        status === 'valid'    ? 'bg-green-50 border-green-100 text-green-600 shadow-sm shadow-green-50' :
                                        status === 'soon'     ? 'bg-yellow-50 border-yellow-100 text-yellow-600 shadow-sm shadow-yellow-50' :
                                        status === 'expired'  ? 'bg-red-50 border-red-100 text-red-600 animate-pulse shadow-sm shadow-red-50' :
                                                               'bg-gray-50 border-gray-100 text-gray-300'
                                    }`}
                                >
                                    <span className="text-[9px] font-black tracking-tighter uppercase mb-1">{dt.label}</span>
                                    {status === 'pending'
                                        ? <Plus className="w-4 h-4 opacity-20" />
                                        : status === 'expired'
                                            ? <AlertCircle className="w-3.5 h-3.5" />
                                            : <Check className="w-3.5 h-3.5" />
                                    }
                                    {expiryLabel && (
                                        <span className="text-[8px] font-bold mt-1 opacity-70">{expiryLabel}</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default VehicleCard
