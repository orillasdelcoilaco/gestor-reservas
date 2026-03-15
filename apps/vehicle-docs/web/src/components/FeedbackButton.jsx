import { useState } from 'react'
import axios from 'axios'
import { MessageSquarePlus, X, Send, CheckCircle } from 'lucide-react'

const CATEGORIES = ['Sugerencia', 'Error', 'Pregunta', 'Otro']

const FeedbackButton = () => {
    const [open, setOpen] = useState(false)
    const [category, setCategory] = useState('Sugerencia')
    const [message, setMessage] = useState('')
    const [status, setStatus] = useState('idle') // idle | sending | success | error
    const [errorMsg, setErrorMsg] = useState('')

    const reset = () => {
        setMessage('')
        setCategory('Sugerencia')
        setStatus('idle')
        setErrorMsg('')
    }

    const handleClose = () => {
        setOpen(false)
        reset()
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!message.trim()) return

        setStatus('sending')
        setErrorMsg('')

        try {
            const token = localStorage.getItem('firebaseIdToken')
            await axios.post('/api/feedback', { category, message: message.trim() }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            setStatus('success')
        } catch (err) {
            setStatus('error')
            setErrorMsg(err.response?.data?.error || err.message)
        }
    }

    return (
        <>
            {/* Floating trigger button */}
            <button
                onClick={() => setOpen(true)}
                aria-label="Enviar comentarios"
                data-testid="feedback-trigger"
                className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
            >
                <MessageSquarePlus className="w-5 h-5" />
                <span className="text-sm font-semibold">Comentarios</span>
            </button>

            {/* Modal overlay */}
            {open && (
                <div
                    className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
                    data-testid="feedback-overlay"
                >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-black text-gray-900">Enviar comentarios</h2>
                            <button
                                onClick={handleClose}
                                aria-label="Cerrar"
                                className="text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {status === 'success' ? (
                            <div className="text-center py-6" data-testid="feedback-success">
                                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                                <p className="text-gray-800 font-semibold mb-1">¡Gracias por tu opinión!</p>
                                <p className="text-gray-500 text-sm mb-6">Tus comentarios nos ayudan a mejorar.</p>
                                <button
                                    onClick={handleClose}
                                    data-testid="feedback-close-success"
                                    className="bg-indigo-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all"
                                >
                                    Cerrar
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} noValidate>
                                {/* Category selector */}
                                <div className="flex gap-2 mb-4 flex-wrap">
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => setCategory(cat)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                                                category === cat
                                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                                    : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Message textarea */}
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Describe tu sugerencia o el problema que encontraste..."
                                    rows={4}
                                    required
                                    aria-label="Mensaje"
                                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                                />

                                {status === 'error' && (
                                    <p className="text-red-600 text-xs mt-2" data-testid="feedback-error">
                                        {errorMsg || 'Error al enviar. Intenta de nuevo.'}
                                    </p>
                                )}

                                <button
                                    type="submit"
                                    data-testid="feedback-submit"
                                    disabled={!message.trim() || status === 'sending'}
                                    className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white py-3 rounded-xl text-sm font-bold transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                    {status === 'sending' ? 'Enviando...' : 'Enviar comentarios'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

export default FeedbackButton
