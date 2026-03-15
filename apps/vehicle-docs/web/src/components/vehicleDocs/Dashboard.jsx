import { useState, useEffect } from 'react'
import axios from 'axios'
import { Car, Plus, Settings } from 'lucide-react'
import VehicleCard from './VehicleCard'
import VehicleDetailView from './VehicleDetailView'
import VehicleWizard from './VehicleWizard'
import FleetAdmin from './FleetAdmin'

const Dashboard = ({ userProfile }) => {
    const [vehicles, setVehicles] = useState([])
    const [viewMode, setViewMode] = useState('LIST') // LIST, WIZARD, DETAIL, ADMIN
    const [selectedVehicle, setSelectedVehicle] = useState(null)

    useEffect(() => {
        if (viewMode === 'LIST') fetchVehicles()
    }, [viewMode])

    const fetchVehicles = async () => {
        try {
            const token = localStorage.getItem('firebaseIdToken')
            // Use the new simplified route
            const res = await axios.get('/api/vehicle-docs/vehicles', { headers: { Authorization: `Bearer ${token}` } })

            // Handle { success: true, vehicles: [...] } response structure
            const list = res.data.vehicles || []
            setVehicles(list)
        } catch (err) { console.error(err) }
    }

    const startWizard = (vehicle = null) => {
        setSelectedVehicle(vehicle)
        setViewMode('WIZARD')
    }

    const handleDeleteVehicle = async (id) => {
        if (!window.confirm('¿Eliminar este vehículo y todos sus documentos?')) return
        const token = localStorage.getItem('firebaseIdToken')
        try {
            await axios.delete(`/api/vehicle-docs/vehicles/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            fetchVehicles()
        } catch (err) { alert('Error: ' + err.message) }
    }

    if (viewMode === 'DETAIL' && selectedVehicle) {
        return <VehicleDetailView
            vehicleId={selectedVehicle.id}
            onBack={() => { setViewMode('LIST'); setSelectedVehicle(null); fetchVehicles(); }}
            onContinue={() => setViewMode('WIZARD')}
        />
    }

    if (viewMode === 'WIZARD') {
        return <VehicleWizard
            existingVehicle={selectedVehicle}
            onCancel={() => { setViewMode('LIST'); setSelectedVehicle(null); }}
            onFinish={() => { setViewMode('LIST'); setSelectedVehicle(null); }}
        />
    }

    if (viewMode === 'ADMIN') {
        return <FleetAdmin onBack={() => setViewMode('LIST')} userProfile={userProfile} />
    }

    return (
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6 md:mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Mis Vehículos</h1>
                    <p className="text-gray-500 mt-0.5 text-sm">Gestiona la documentación de tu flota.</p>
                </div>
                <div className="flex items-center gap-2">
                    {userProfile?.isAdmin && (
                        <button
                            onClick={() => setViewMode('ADMIN')}
                            className="flex items-center px-3 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 shadow-sm transition-all text-sm"
                        >
                            <Settings className="w-4 h-4 mr-1.5 text-gray-500" />
                            <span className="hidden sm:inline">Administrar Flotas</span>
                            <span className="sm:hidden">Flotas</span>
                        </button>
                    )}
                    <button
                        onClick={() => startWizard(null)}
                        className="flex items-center px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-all text-sm"
                    >
                        <Plus className="w-4 h-4 mr-1.5" />
                        <span className="hidden sm:inline">Nuevo Vehículo (Asistente IA)</span>
                        <span className="sm:hidden">Nuevo Vehículo</span>
                    </button>
                </div>
            </div>

            {vehicles.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                    <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-900">Tu garaje está vacío</h3>
                    <p className="text-gray-500 mb-6">Usa el asistente IA para registrar tu primer vehículo con el Padrón.</p>
                    <button onClick={() => startWizard(null)} className="text-indigo-600 font-medium hover:underline">Iniciar Asistente</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">
                    {vehicles.map(v => (
                        <VehicleCard
                            key={v.id}
                            vehicle={v}
                            onContinue={() => startWizard(v)}
                            onDelete={() => handleDeleteVehicle(v.id)}
                            onClick={(id) => {
                                setSelectedVehicle(v);
                                setViewMode('DETAIL');
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

export default Dashboard
