import { useState } from 'react';
import './AddVehicleForm.css';

function AddVehicleForm({ onClose, onSuccess }) {
    const [formData, setFormData] = useState({
        patente: '',
        vin: '',
        propietario: '',
        marca: '',
        modelo: '',
        año: '',
        color: ''
    });
    const [photo, setPhoto] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [loading, setLoading] = useState(false);

    function handleChange(e) {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    }

    function handlePhotoChange(e) {
        const file = e.target.files[0];
        if (file) {
            setPhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);

        try {
            const formDataToSend = new FormData();

            Object.entries(formData).forEach(([key, value]) => {
                formDataToSend.append(key, value);
            });

            if (photo) {
                formDataToSend.append('photo', photo);
            }

            const response = await fetch('/api/vehicle-docs/vehicles', {
                method: 'POST',
                body: formDataToSend
            });

            const result = await response.json();

            if (result.success) {
                onSuccess(result.id);
            } else {
                alert('Error: ' + result.error);
            }

        } catch (error) {
            console.error('Error creando vehículo:', error);
            alert('Error de conexión');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Agregar Vehículo</h2>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="photo-upload">
                        {photoPreview ? (
                            <img src={photoPreview} alt="Preview" className="photo-preview" />
                        ) : (
                            <div className="photo-placeholder">
                                📷 Foto del vehículo (opcional)
                            </div>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                            id="photo-input"
                            style={{ display: 'none' }}
                        />
                        <label htmlFor="photo-input" className="photo-btn">
                            {photoPreview ? 'Cambiar foto' : 'Agregar foto'}
                        </label>
                    </div>

                    <div className="form-grid">
                        <div className="form-group">
                            <label>Patente *</label>
                            <input
                                type="text"
                                name="patente"
                                value={formData.patente}
                                onChange={handleChange}
                                placeholder="CXKK74"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>VIN / Nº Chasis *</label>
                            <input
                                type="text"
                                name="vin"
                                value={formData.vin}
                                onChange={handleChange}
                                placeholder="1D7RW3GK9BS521441"
                                required
                            />
                        </div>

                        <div className="form-group full-width">
                            <label>Propietario *</label>
                            <input
                                type="text"
                                name="propietario"
                                value={formData.propietario}
                                onChange={handleChange}
                                placeholder="Héctor Meza Montaner"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Marca *</label>
                            <input
                                type="text"
                                name="marca"
                                value={formData.marca}
                                onChange={handleChange}
                                placeholder="Dodge"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Modelo *</label>
                            <input
                                type="text"
                                name="modelo"
                                value={formData.modelo}
                                onChange={handleChange}
                                placeholder="Dakota 3.7"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Año *</label>
                            <input
                                type="number"
                                name="año"
                                value={formData.año}
                                onChange={handleChange}
                                placeholder="2011"
                                min="1900"
                                max="2030"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label>Color *</label>
                            <input
                                type="text"
                                name="color"
                                value={formData.color}
                                onChange={handleChange}
                                placeholder="Rojo"
                                required
                            />
                        </div>
                    </div>

                    <div className="form-actions">
                        <button type="button" onClick={onClose} disabled={loading}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={loading} className="primary">
                            {loading ? 'Guardando...' : 'Guardar Vehículo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default AddVehicleForm;
