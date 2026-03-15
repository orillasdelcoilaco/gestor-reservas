// Test script para ver qué retorna exactamente el endpoint /extract
const fs = require('fs');
const path = require('path');

// Simular una llamada al servicio directamente
const { extractVehicleDocumentData } = require('./services/vehicleDocs/aiService');
const { processDocumentForInspection } = require('./services/vehicleDocs/imageProcessingService');

async function testExtraction() {
    try {
        // Cargar una imagen de prueba (usar la última subida por el usuario)
        const testImagePath = path.join(__dirname, 'test-padron.jpg');

        if (!fs.existsSync(testImagePath)) {
            console.log('❌ No hay imagen de prueba en test-padron.jpg');
            console.log('Por favor, copia una imagen del padrón a backend/test-padron.jpg y ejecuta este script nuevamente');
            return;
        }

        const imageBuffer = fs.readFileSync(testImagePath);

        console.log('\n=== INICIANDO TEST DE EXTRACCIÓN ===\n');

        // PASO 1: Procesar imagen
        console.log('[1/2] Procesando imagen con Sharp...');
        const processed = await processDocumentForInspection(imageBuffer, 'PADRON', 'front');
        console.log('Resultado procesamiento:');
        console.log('  - Success:', processed.success);
        console.log('  - QR detectado:', !!processed.qrData);
        console.log('  - Warning:', processed.warning || 'ninguno');

        // PASO 2: Extraer datos con IA
        console.log('\n[2/2] Extrayendo datos con Gemini...');
        const extracted = await extractVehicleDocumentData(
            processed.processed,
            processed.qrData ? [processed.qrData] : [],
            'PADRON'
        );

        console.log('\n=== DATOS EXTRAÍDOS POR IA ===');
        console.log(JSON.stringify(extracted, null, 2));

        console.log('\n=== MAPEO A RESPUESTA ===');
        const response = {
            type: extracted.documentType,
            patente: extracted.patente || extracted.data?.patente,
            marca: extracted.data?.marca,
            modelo: extracted.data?.modelo,
            color: extracted.data?.color,
            anio: extracted.data?.anio || extracted.data?.año,
            numeroMotor: extracted.data?.numeroMotor,
            vin: extracted.data?.vin || extracted.data?.chasis,
        };

        console.log('Respuesta mapeada:');
        console.log('  Tipo:', response.type);
        console.log('  Patente:', response.patente);
        console.log('  Marca:', response.marca);
        console.log('  Modelo:', response.modelo);
        console.log('  Color:', response.color);
        console.log('  Año:', response.anio);
        console.log('  Número Motor:', response.numeroMotor);
        console.log('  VIN:', response.vin);

        console.log('\n=== TEST COMPLETADO ===\n');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error(error.stack);
    }
}

testExtraction().then(() => process.exit(0));
