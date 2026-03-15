import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import axios from 'axios'
import VehicleDocs from './pages/VehicleDocs'
import TestExtraction from './pages/TestExtraction'
import Dashboard from './components/vehicleDocs/Dashboard'

// Helper: Auth Layout
const AuthLayout = ({ children }) => {
    const [loading, setLoading] = useState(true)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        const checkAuth = async () => {
            const token = localStorage.getItem('firebaseIdToken')
            if (!token) {
                setLoading(false)
                return
            }
            try {
                await axios.get('/api/me', { headers: { Authorization: `Bearer ${token}` } })
                setAuthorized(true)
            } catch (error) {
                console.error("Auth error", error)
                localStorage.removeItem('firebaseIdToken')
            } finally {
                setLoading(false)
            }
        }
        checkAuth()
    }, [])

    if (loading) return <div className="flex items-center justify-center h-screen">Cargando...</div>

    if (!authorized) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Acceso Restringido</h2>
                    <p className="text-gray-500 mb-6">No se detectó una sesión activa. Por favor, ingresa tu token para continuar (Entorno de Pruebas).</p>
                    <button
                        onClick={() => {
                            const t = prompt("Ingresa tu Firebase ID Token:");
                            if (t) {
                                localStorage.setItem('firebaseIdToken', t);
                                window.location.reload();
                            }
                        }}
                        className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 w-full"
                    >
                        Ingresar Token Manual
                    </button>
                    <p className="mt-4 text-xs text-gray-400">Si esto fuera producción, serías redirigido al Login principal.</p>
                </div>
            </div>
        )
    }

    return children
}

const App = () => {
    return (
        <BrowserRouter basename="/vehiculos/app">
            <Routes>
                <Route path="/" element={<AuthLayout><Dashboard /></AuthLayout>} />
                <Route path="/vehicle-docs" element={<AuthLayout><VehicleDocs /></AuthLayout>} />
                <Route path="/test-extraction" element={<TestExtraction />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
