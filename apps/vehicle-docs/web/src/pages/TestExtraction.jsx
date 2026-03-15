import { useState } from 'react'

function TestExtraction() {
    const [selectedFile, setSelectedFile] = useState(null)
    const [extractedData, setExtractedData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [rawResponse, setRawResponse] = useState(null)

    const handleFileSelect = (e) => {
        setSelectedFile(e.target.files[0])
    }

    const handleExtract = async () => {
        if (!selectedFile) return

        setLoading(true)
        const formData = new FormData()
        formData.append('document', selectedFile)
        formData.append('expectedDocType', 'PADRON')
        formData.append('vehicleId', 'test-vehicle-123')

        try {
            const response = await fetch('/api/vehicle-docs/test-extract', {
                method: 'POST',
                headers: {
                    // Include auth token if your backend requires it globally, even for test
                    'Authorization': `Bearer ${localStorage.getItem('firebaseIdToken')}`
                },
                body: formData
            })

            const result = await response.json()
            setRawResponse(result)
            setExtractedData(result.extractedData)
        } catch (error) {
            alert('Error: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Prueba de Extracción de Datos</h1>

            <div style={{ marginBottom: '20px' }}>
                <input type="file" accept="image/*" onChange={handleFileSelect} />
                <button onClick={handleExtract} disabled={loading || !selectedFile}>
                    {loading ? 'Procesando...' : 'Extraer Datos'}
                </button>
            </div>

            {selectedFile && (
                <div>
                    <h3>Imagen seleccionada:</h3>
                    <img
                        src={URL.createObjectURL(selectedFile)}
                        alt="Preview"
                        style={{ maxWidth: '400px', border: '1px solid #ccc' }}
                    />
                </div>
            )}

            {rawResponse && (
                <div style={{ marginTop: '20px' }}>
                    <h3>Respuesta Completa (JSON):</h3>
                    <pre style={{
                        background: '#f5f5f5',
                        padding: '10px',
                        overflow: 'auto',
                        fontSize: '12px'
                    }}>
                        {JSON.stringify(rawResponse, null, 2)}
                    </pre>
                </div>
            )}

            {extractedData && (
                <div style={{ marginTop: '20px', border: '1px solid #ddd', padding: '15px' }}>
                    <h3>Datos Extraídos:</h3>
                    <p><strong>Tipo:</strong> {extractedData.documentType}</p>
                    <p><strong>Confianza:</strong> {extractedData.confidence}%</p>

                    <h4>Datos del Vehículo:</h4>
                    <ul>
                        <li>Patente: {extractedData.data.patente || 'N/A'}</li>
                        <li>RUT: {extractedData.data.rut || 'N/A'}</li>
                        <li>Propietario: {extractedData.data.propietario || 'N/A'}</li>
                        <li>Marca: {extractedData.data.marca || 'N/A'}</li>
                        <li>Modelo: {extractedData.data.modelo || 'N/A'}</li>
                        <li>Año: {extractedData.data.año || 'N/A'}</li>
                        <li>Color: {extractedData.data.color || 'N/A'}</li>
                        <li>Motor: {extractedData.data.numeroMotor || 'N/A'}</li>
                        <li>Chasis: {extractedData.data.numeroChasis || 'N/A'}</li>
                    </ul>

                    {extractedData.warnings && extractedData.warnings.length > 0 && (
                        <>
                            <h4>Advertencias:</h4>
                            <ul>
                                {extractedData.warnings.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default TestExtraction
