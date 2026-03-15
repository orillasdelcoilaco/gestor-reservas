from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import base64
from document_processor import process_document, encode_image_to_bytes

app = FastAPI(title="OpenCV Document Processing Service")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"status": "ok", "service": "OpenCV Document Processor"}

@app.get("/health")
async def health():
    return {"status": "healthy", "opencv": "ready"}

@app.post("/process-document")
async def process_document_endpoint(
    document: UploadFile = File(...),
    documentType: str = Form(default="PADRON"),
    qrImage: UploadFile = File(None)  # NUEVO: QR pre-recortado manualmente
):
    """
    Procesar documento con OpenCV:
    - Detectar y enderezar documento
    - Convertir a fotocopia (blanco/negro)
    - Separar triplicados
    - Extraer QR code (automático o manual si viene qrImage)
    """
    try:
        # Leer imagen del documento
        image_bytes = await document.read()
        
        # Leer QR manual si viene
        qr_image_bytes = None
        if qrImage:
            qr_image_bytes = await qrImage.read()
            print("📱 QR manual recibido, tamaño:", len(qr_image_bytes), "bytes")
        
        # Procesar con OpenCV
        result = process_document(image_bytes, documentType, qr_image_bytes)
        
        # Convertir imágenes a base64
        processed_base64 = base64.b64encode(
            encode_image_to_bytes(result['processed'], 'JPEG', 95)
        ).decode('utf-8')
        
        thumbnail_base64 = base64.b64encode(
            encode_image_to_bytes(result['thumbnail'], 'JPEG', 85)
        ).decode('utf-8')
        
        qr_base64 = None
        if result['qr_image'] is not None:
            qr_base64 = base64.b64encode(
                encode_image_to_bytes(result['qr_image'], 'PNG')
            ).decode('utf-8')

        color_base64 = base64.b64encode(
            encode_image_to_bytes(result['color_processed'], 'JPEG', 95)
        ).decode('utf-8')

        # Preparar respuesta
        response = {
            "success": True,
            "images": {
                "processed": f"data:image/jpeg;base64,{processed_base64}",
                "colorProcessed": f"data:image/jpeg;base64,{color_base64}",
                "thumbnail": f"data:image/jpeg;base64,{thumbnail_base64}",
                "qr": f"data:image/png;base64,{qr_base64}" if qr_base64 else None
            },
            "qr_data": result['qr_data'],
            "metadata": result['metadata']
        }
        
        return JSONResponse(content=response)
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}\n")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e)
            }
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
