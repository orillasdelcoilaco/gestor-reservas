const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inicializar Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Schema para structured output (Gemini usa un formato ligeramente diferente)
const VEHICLE_DOCUMENT_SCHEMA = {
    type: "object",
    properties: {
        documentType: {
            type: "string",
            description: "Tipo de documento",
            enum: ["PADRON", "PERMISO_CIRCULACION", "REVISION_TECNICA", "SOAP", "FOTO_VEHICULO"]
        },
        confidence: {
            type: "number",
            description: "Nivel de confianza de 0 a 100"
        },
        data: {
            type: "object",
            properties: {
                patente: { type: "string", description: "Placa del vehículo" },
                rut: { type: "string", description: "RUT del propietario" },
                propietario: { type: "string", description: "Nombre del propietario" },
                marca: { type: "string", description: "Marca del vehículo" },
                modelo: { type: "string", description: "Modelo del vehículo" },
                año: { type: "string", description: "Año del vehículo" },
                color: { type: "string", description: "Color del vehículo" },
                numeroMotor: { type: "string", description: "Número de motor" },
                numeroChasis: { type: "string", description: "Número de chasis/VIN" },
                fechaEmision: { type: "string", description: "Fecha de emisión YYYY-MM-DD" },
                fechaVencimiento: { type: "string", description: "Fecha de vencimiento YYYY-MM-DD" }
            },
            required: ["patente"]
        },
        qrValidation: {
            type: "object",
            properties: {
                qrDetectadoPorCliente: { type: "boolean" },
                qrContenido: { type: "string" },
                coincideConDatosOCR: { type: "boolean" }
            }
        },
        warnings: {
            type: "array",
            items: { type: "string" },
            description: "Lista de advertencias o problemas detectados"
        }
    },
    required: ["documentType", "data", "confidence"]
};

// Type-specific extraction instructions
function buildPrompt(expectedDocType, qrContext) {
    const typeInstructions = {
        REVISION: `
📋 INSTRUCCIONES PARA CERTIFICADO DE REVISIÓN TÉCNICA CHILENO:
1. PATENTE: campo "PLACA PATENTE", formato "XXXX99" o "XXNN99" (sin puntos ni guiones)
2. FECHA REVISIÓN (fechaEmision): campo "FECHA REVISIÓN:" — lee el día, mes y año con cuidado.
   IMPORTANTE: el año tiene 4 dígitos (ej: 2026, 2025, 2024). NO confundir con el día.
   Formato de salida: YYYY-MM-DD
3. VÁLIDO HASTA (fechaVencimiento): campo "VÁLIDO HASTA" — puede ser solo mes y año (ej: "JULIO 2026").
   Si es solo mes+año, usa el último día del mes. Formato de salida: YYYY-MM-DD
4. RESULTADO: campo "APROBADO" o "RECHAZADO" → guardar en data.resultado
5. MESES EN ESPAÑOL: ENERO=01, FEBRERO=02, MARZO=03, ABRIL=04, MAYO=05, JUNIO=06,
   JULIO=07, AGOSTO=08, SEPTIEMBRE=09, OCTUBRE=10, NOVIEMBRE=11, DICIEMBRE=12
`,
        REVISION_TECNICA: `
📋 INSTRUCCIONES PARA CERTIFICADO DE REVISIÓN TÉCNICA CHILENO:
1. PATENTE: campo "PLACA PATENTE", formato "XXXX99" o "XXNN99" (sin puntos ni guiones)
2. FECHA REVISIÓN (fechaEmision): campo "FECHA REVISIÓN:" — el año tiene 4 dígitos (ej: 2026). NO confundir con el día.
   Formato de salida: YYYY-MM-DD
3. VÁLIDO HASTA (fechaVencimiento): campo "VÁLIDO HASTA" — si es solo mes+año (ej: "JULIO 2026"), usa el último día del mes.
   Formato de salida: YYYY-MM-DD
4. RESULTADO: campo "APROBADO" o "RECHAZADO" → guardar en data.resultado
5. MESES EN ESPAÑOL: ENERO=01, FEBRERO=02, MARZO=03, ABRIL=04, MAYO=05, JUNIO=06,
   JULIO=07, AGOSTO=08, SEPTIEMBRE=09, OCTUBRE=10, NOVIEMBRE=11, DICIEMBRE=12
`,
        SOAP: `
📋 INSTRUCCIONES PARA SEGURO OBLIGATORIO (SOAP) CHILENO:
1. PATENTE: número de placa del vehículo asegurado
2. FECHA EMISIÓN (fechaEmision): fecha de emisión de la póliza — formato YYYY-MM-DD
3. FECHA VENCIMIENTO (fechaVencimiento): fecha hasta la que cubre el seguro — formato YYYY-MM-DD
4. ASEGURADORA: nombre de la compañía aseguradora → guardar en data.aseguradora
5. MESES EN ESPAÑOL: ENERO=01 … DICIEMBRE=12
`,
        PERMISO: `
📋 INSTRUCCIONES PARA PERMISO DE CIRCULACIÓN CHILENO:
1. PATENTE: número de placa del vehículo
2. FECHA EMISIÓN (fechaEmision): fecha en que se emitió el permiso — formato YYYY-MM-DD
3. FECHA VENCIMIENTO (fechaVencimiento): fecha de vencimiento del permiso — formato YYYY-MM-DD
4. MUNICIPALIDAD: nombre de la municipalidad emisora → guardar en data.municipalidad
5. MESES EN ESPAÑOL: ENERO=01 … DICIEMBRE=12
`,
        PERMISO_CIRCULACION: `
📋 INSTRUCCIONES PARA PERMISO DE CIRCULACIÓN CHILENO:
1. PATENTE: número de placa del vehículo
2. FECHA EMISIÓN (fechaEmision): fecha en que se emitió el permiso — formato YYYY-MM-DD
3. FECHA VENCIMIENTO (fechaVencimiento): fecha de vencimiento del permiso — formato YYYY-MM-DD
4. MUNICIPALIDAD: nombre de la municipalidad emisora → guardar en data.municipalidad
5. MESES EN ESPAÑOL: ENERO=01 … DICIEMBRE=12
`,
        PADRON: `
📋 INSTRUCCIONES PARA PADRÓN VEHICULAR CHILENO:
1. PATENTE: formato "XXXX.XX-X" (4 letras, punto, 2 números, guión, número)
2. RUT PROPIETARIO: busca "RUT:", formato "XX.XXX.XXX-X"
3. PROPIETARIO: nombre completo del dueño
4. MARCA: en mayúsculas (ej: DODGE, TOYOTA)
5. MODELO: descripción completa (ej: "DAKOTA D CAB 4X4 3.7 AUT")
6. AÑO: 4 dígitos
7. COLOR: (ej: ROJO, BLANCO, NEGRO)
8. NÚMERO MOTOR: serie alfanumérica
9. CHASIS/VIN: 17 caracteres alfanuméricos
10. FECHA EMISIÓN (fechaEmision): busca "FECHA EMISIÓN" — formato YYYY-MM-DD
`
    };

    const specific = typeInstructions[expectedDocType] || `
📋 Extrae todos los campos visibles del documento vehicular chileno.
Fechas siempre en formato YYYY-MM-DD. Si el mes está en español (ENERO, JULIO, etc.), conviértelo a número.
`;

    return `
Eres un experto en OCR de documentos vehiculares chilenos. Analiza esta imagen con MÁXIMA precisión.

TIPO DE DOCUMENTO: ${expectedDocType || 'Identificar automáticamente'}
${qrContext}

${specific}

⚠️ REGLAS GENERALES:
- Lee CADA carácter con cuidado. Los años tienen SIEMPRE 4 dígitos.
- Las fechas SIEMPRE en formato YYYY-MM-DD en la respuesta JSON.
- Si un campo no existe, déjalo como "" (string vacío).

RESPONDE con JSON válido siguiendo el schema exacto.
`;
}

async function extractVehicleDocumentData(imageBuffer, detectedQRs = [], expectedDocType = null) {
    const qrContext = detectedQRs.length > 0
        ? `\n\nCÓDIGOS QR DETECTADOS: ${JSON.stringify(detectedQRs)}\nValida que coincidan con los datos OCR.`
        : '\n\nNO se detectaron QR codes.';

    const prompt = buildPrompt(expectedDocType, qrContext);

    // Models ordered by preference (free tier quotas):
    // gemini-2.0-flash: 1500/day | gemini-1.5-flash-8b: 4000/day | gemini-2.5-flash: 20/day
    const MODEL_PRIORITY = ['gemini-2.0-flash', 'gemini-1.5-flash-8b', 'gemini-2.5-flash'];

    const callGemini = async (modelName) => {
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: VEHICLE_DOCUMENT_SCHEMA,
            }
        });

        const base64Image = imageBuffer.toString('base64');

        console.log(`[AI Service] Llamando a ${modelName} | ${imageBuffer.length} bytes`);

        const result = await model.generateContent([
            prompt,
            { inlineData: { mimeType: 'image/jpeg', data: base64Image } }
        ]);

        const text = result.response.text();
        const extractedData = JSON.parse(text);

        if (!extractedData.documentType || !extractedData.data) {
            throw new Error('Respuesta de IA incompleta');
        }

        console.log('[AI Service] ✅ Datos extraídos con', modelName, '| tipo:', extractedData.documentType);
        return extractedData;
    };

    // Extract retry delay from 429 error message (e.g. "Please retry in 27.9s")
    const getRetryDelay = (errMsg) => {
        const m = String(errMsg).match(/retry in ([\d.]+)s/i);
        return m ? Math.ceil(parseFloat(m[1])) * 1000 : 30000;
    };

    let lastError;
    for (const modelName of MODEL_PRIORITY) {
        try {
            return await callGemini(modelName);
        } catch (error) {
            lastError = error;
            const is429 = String(error.message).includes('429') || String(error.message).includes('Too Many Requests');
            const isQuota = String(error.message).includes('quota') || String(error.message).includes('RESOURCE_EXHAUSTED');

            if (is429 || isQuota) {
                const delay = getRetryDelay(error.message);
                console.warn(`[AI Service] ⚠️ ${modelName} cuota agotada. Esperando ${delay/1000}s antes de intentar siguiente modelo...`);
                await new Promise(r => setTimeout(r, Math.min(delay, 35000)));
                continue; // Try next model
            }
            // Non-quota error: don't retry with other models
            break;
        }
    }

    // All models failed
    const fs = require('fs');
    fs.appendFileSync('gemini_error.log', `\n[${new Date().toISOString()}] ${lastError?.message}\n`);
    console.error('[AI Service] ❌ Todos los modelos fallaron:', lastError?.message);
    throw new Error(`Extracción IA fallida: ${lastError?.message}`);
}

module.exports = { extractVehicleDocumentData };
