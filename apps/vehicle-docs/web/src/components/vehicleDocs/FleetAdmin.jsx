import { useState, useEffect } from 'react'
import axios from 'axios'
import { Users, Car, Plus, UserCheck, UserX, ChevronLeft, Loader2, Check, AlertCircle, UserPlus } from 'lucide-react'

const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem('firebaseIdToken')}`
})

const FleetAdmin = ({ onBack, userProfile }) => {
    const [users, setUsers] = useState([])
    const [families, setFamilies] = useState([])
    const [loading, setLoading] = useState(true)
    const [newFamilyName, setNewFamilyName] = useState('')
    const [creating, setCreating] = useState(false)
    const [assigning, setAssigning] = useState(null) // uid being assigned
    const [toast, setToast] = useState(null) // { type: 'success'|'error', msg }
    const [newUserEmail, setNewUserEmail] = useState('')
    const [addingUser, setAddingUser] = useState(false)
    const [orphanVehicles, setOrphanVehicles] = useState([])
    const [migrating, setMigrating] = useState(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [usersRes, familiesRes, orphanRes] = await Promise.all([
                axios.get('/api/vehicle-docs/admin/users', { headers: authHeader() }),
                axios.get('/api/vehicle-docs/admin/families', { headers: authHeader() }),
                axios.get('/api/vehicle-docs/admin/orphan-vehicles', { headers: authHeader() })
            ])
            setUsers(usersRes.data.users || [])
            setFamilies(familiesRes.data.families || [])
            setOrphanVehicles(orphanRes.data.vehicles || [])
        } catch (err) {
            showToast('error', 'Error cargando datos: ' + (err.response?.data?.error || err.message))
        } finally {
            setLoading(false)
        }
    }

    const showToast = (type, msg) => {
        setToast({ type, msg })
        setTimeout(() => setToast(null), 3500)
    }

    const handleCreateFamily = async (useExistingId = false) => {
        if (!newFamilyName.trim()) return
        setCreating(true)
        try {
            const payload = { name: newFamilyName.trim() }
            if (useExistingId && userProfile?.familyGroup) {
                payload.id = userProfile.familyGroup
            }
            const res = await axios.post('/api/vehicle-docs/admin/families', payload, { headers: authHeader() })
            setFamilies(prev => {
                const exists = prev.find(f => f.id === res.data.id)
                if (exists) return prev.map(f => f.id === res.data.id ? { ...f, name: res.data.name } : f)
                return [...prev, { id: res.data.id, name: res.data.name, members: [] }]
            })
            setNewFamilyName('')
            showToast('success', `Flota "${res.data.name}" creada`)
        } catch (err) {
            showToast('error', 'Error: ' + (err.response?.data?.error || err.message))
        } finally {
            setCreating(false)
        }
    }

    const handleAddUser = async () => {
        if (!newUserEmail.trim()) return
        setAddingUser(true)
        try {
            const res = await axios.post('/api/vehicle-docs/admin/users',
                { email: newUserEmail.trim() },
                { headers: authHeader() }
            )
            const { user, alreadyExists } = res.data
            setUsers(prev => {
                if (prev.find(u => u.uid === user.uid)) return prev
                return [...prev, user]
            })
            setNewUserEmail('')
            showToast('success', alreadyExists ? `${user.email} ya estaba registrado` : `${user.email} agregado al sistema`)
        } catch (err) {
            showToast('error', err.response?.data?.error || err.message)
        } finally {
            setAddingUser(false)
        }
    }

    const handleMigrateVehicles = async (fromFamilyGroup, toFamilyGroup) => {
        setMigrating(true)
        try {
            const res = await axios.post('/api/vehicle-docs/admin/migrate-vehicles',
                { fromFamilyGroup, toFamilyGroup },
                { headers: authHeader() }
            )
            showToast('success', `${res.data.migrated} vehículo(s) migrado(s) correctamente`)
            // Recargar vehículos huérfanos
            const orphanRes = await axios.get('/api/vehicle-docs/admin/orphan-vehicles', { headers: authHeader() })
            setOrphanVehicles(orphanRes.data.vehicles || [])
        } catch (err) {
            showToast('error', 'Error migrando: ' + (err.response?.data?.error || err.message))
        } finally {
            setMigrating(false)
        }
    }

    const handleQuickAssignToAdmin = async (uid) => {
        if (!userProfile?.familyGroup) return
        await handleAssignFamily(uid, userProfile.familyGroup)
    }

    const handleAssignFamily = async (uid, familyId) => {
        setAssigning(uid)
        try {
            await axios.put(`/api/vehicle-docs/admin/users/${uid}/family`,
                { familyId },
                { headers: authHeader() }
            )
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, familyGroup: familyId } : u))
            const family = families.find(f => f.id === familyId)
            showToast('success', `Usuario asignado a "${family?.name}"`)
        } catch (err) {
            showToast('error', 'Error: ' + (err.response?.data?.error || err.message))
        } finally {
            setAssigning(null)
        }
    }

    const handleRemoveFamily = async (uid) => {
        setAssigning(uid)
        try {
            await axios.delete(`/api/vehicle-docs/admin/users/${uid}/family`, { headers: authHeader() })
            setUsers(prev => prev.map(u => u.uid === uid ? { ...u, familyGroup: null } : u))
            showToast('success', 'Usuario removido de su flota')
        } catch (err) {
            showToast('error', 'Error: ' + (err.response?.data?.error || err.message))
        } finally {
            setAssigning(null)
        }
    }

    const getFamilyName = (familyId) => families.find(f => f.id === familyId)?.name || familyId

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                    <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Administrar Flotas</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Gestiona usuarios y flotas familiares</p>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all
                    ${toast.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
                    {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {toast.msg}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
            ) : (
                <div className="space-y-8">

                    {/* Flotas */}
                    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                            <Car className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-base font-semibold text-gray-800">Flotas Familiares</h2>
                            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{families.length}</span>
                        </div>

                        {families.length === 0 ? (
                            <p className="px-6 py-8 text-sm text-gray-400 text-center">No hay flotas creadas aún</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {families.map(family => {
                                    const memberCount = users.filter(u => u.familyGroup === family.id).length
                                    return (
                                        <li key={family.id} className="px-6 py-3 flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                                                <Car className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900">{family.name}</p>
                                                <p className="text-xs text-gray-400">{memberCount} miembro{memberCount !== 1 ? 's' : ''}</p>
                                            </div>
                                            <span className="text-xs font-mono text-gray-300">{family.id.slice(0, 8)}…</span>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}

                        {/* Crear nueva flota */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 space-y-3">
                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    placeholder="Nombre de la nueva flota…"
                                    value={newFamilyName}
                                    onChange={e => setNewFamilyName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleCreateFamily()}
                                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                />
                                <button
                                    onClick={() => handleCreateFamily(false)}
                                    disabled={creating || !newFamilyName.trim()}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                >
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                    Crear nueva
                                </button>
                            </div>
                            {userProfile?.familyGroup && (
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleCreateFamily(true)}
                                        disabled={creating || !newFamilyName.trim()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
                                    >
                                        <Car className="w-3.5 h-3.5" />
                                        Crear usando mi grupo actual (preserva vehículos existentes)
                                    </button>
                                    <span className="text-xs text-gray-400 font-mono">{userProfile.familyGroup.slice(0, 12)}…</span>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Usuarios */}
                    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                            <Users className="w-5 h-5 text-indigo-500" />
                            <h2 className="text-base font-semibold text-gray-800">Usuarios del Sistema</h2>
                            <span className="ml-auto text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{users.length}</span>
                        </div>

                        {/* Agregar usuario por email */}
                        <div className="px-6 py-4 bg-indigo-50 border-b border-indigo-100 flex gap-3">
                            <div className="flex-1 flex gap-2">
                                <UserPlus className="w-4 h-4 text-indigo-400 shrink-0 mt-2.5" />
                                <input
                                    type="email"
                                    placeholder="Email del usuario a agregar…"
                                    value={newUserEmail}
                                    onChange={e => setNewUserEmail(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddUser()}
                                    className="flex-1 text-sm border border-indigo-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                />
                            </div>
                            <button
                                onClick={handleAddUser}
                                disabled={addingUser || !newUserEmail.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                            >
                                {addingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                Agregar
                            </button>
                        </div>

                        {users.length === 0 ? (
                            <p className="px-6 py-8 text-sm text-gray-400 text-center">No hay usuarios registrados aún</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {users.map(user => (
                                    <li key={user.uid} className="px-6 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <span className="text-sm font-semibold text-gray-500">
                                                    {(user.email?.[0] || '?').toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
                                                {user.familyGroup ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full mt-1">
                                                        <UserCheck className="w-3 h-3" />
                                                        {getFamilyName(user.familyGroup)}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mt-1">
                                                        <UserX className="w-3 h-3" />
                                                        Sin flota asignada
                                                    </span>
                                                )}
                                            </div>
                                            {assigning === user.uid ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-gray-400 shrink-0 mt-1" />
                                            ) : (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {/* Asignación rápida a la flota del admin */}
                                                    {userProfile?.familyGroup && user.familyGroup !== userProfile.familyGroup && (
                                                        <button
                                                            onClick={() => handleQuickAssignToAdmin(user.uid)}
                                                            className="text-xs px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
                                                            title="Agregar a mi flota"
                                                        >
                                                            + Mi flota
                                                        </button>
                                                    )}
                                                    {families.length > 0 && (
                                                        <select
                                                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                                                            value={user.familyGroup || ''}
                                                            onChange={e => e.target.value && handleAssignFamily(user.uid, e.target.value)}
                                                        >
                                                            <option value="">Asignar a flota…</option>
                                                            {families.map(f => (
                                                                <option key={f.id} value={f.id}>{f.name}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {user.familyGroup && (
                                                        <button
                                                            onClick={() => handleRemoveFamily(user.uid)}
                                                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                            title="Quitar de flota"
                                                        >
                                                            <UserX className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    {/* Vehículos sin flota activa */}
                    {orphanVehicles.length > 0 && (
                        <section className="bg-amber-50 rounded-xl border border-amber-200 overflow-hidden">
                            <div className="px-6 py-4 border-b border-amber-200 flex items-center gap-2">
                                <Car className="w-5 h-5 text-amber-500" />
                                <h2 className="text-base font-semibold text-amber-800">Vehículos sin flota activa</h2>
                                <span className="ml-auto text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{orphanVehicles.length}</span>
                            </div>
                            <p className="px-6 pt-4 text-sm text-amber-700">
                                Estos vehículos pertenecen a un grupo anterior y no son visibles para ningún usuario. Migralos a una flota activa.
                            </p>

                            {/* Agrupar por familyGroup y mostrar botón por grupo */}
                            {[...new Set(orphanVehicles.map(v => v.familyGroup))].map(oldGroup => {
                                const groupVehicles = orphanVehicles.filter(v => v.familyGroup === oldGroup)
                                return (
                                    <div key={oldGroup} className="px-6 py-4 border-t border-amber-200 mt-2">
                                        <p className="text-xs text-amber-600 font-mono mb-2">Grupo: {oldGroup}</p>
                                        <ul className="space-y-1 mb-3">
                                            {groupVehicles.map(v => (
                                                <li key={v.id} className="text-sm text-amber-800 flex items-center gap-2">
                                                    <Car className="w-3.5 h-3.5 text-amber-400" />
                                                    {v.patente} — {v.marca} {v.modelo} {v.año || v.anio || ''}
                                                </li>
                                            ))}
                                        </ul>
                                        {families.length > 0 && (
                                            <div className="flex flex-wrap gap-2">
                                                {families.map(f => (
                                                    <button
                                                        key={f.id}
                                                        onClick={() => handleMigrateVehicles(oldGroup, f.id)}
                                                        disabled={migrating}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
                                                    >
                                                        {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Car className="w-3.5 h-3.5" />}
                                                        Mover a "{f.name}"
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </section>
                    )}

                </div>
            )}
        </div>
    )
}

export default FleetAdmin
