import cv2
import numpy as np
from PIL import Image
from pyzbar import pyzbar
import io

def order_points(pts):
    """
    Ordenar 4 puntos en orden: top-left, top-right, bottom-right, bottom-left
    """
    rect = np.zeros((4, 2), dtype="float32")
    
    # Top-left: suma de coordenadas más pequeña
    # Bottom-right: suma de coordenadas más grande
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    
    # Top-right: diferencia más pequeña (y-x)
    # Bottom-left: diferencia más grande
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    
    return rect

def four_point_transform(image, pts):
    """
    Aplicar transformación de perspectiva para enderezar documento
    """
    rect = order_points(pts)
    (tl, tr, br, bl) = rect
    
    # Calcular ancho del documento enderezado
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))
    
    # Calcular alto del documento enderezado
    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))
    
    # Puntos destino para el documento enderezado
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]
    ], dtype="float32")
    
    # Calcular matriz de transformación y aplicarla
    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    
    return warped

def detect_document(image):
    """
    Detectar documento en la imagen y encontrar sus 4 esquinas.
    Usa múltiples estrategias de detección. Si ninguna encuentra un
    cuadrilátero perfecto, devuelve el bounding-rect del contorno más
    grande como último recurso.
    """
    orig_height, orig_width = image.shape[:2]
    ratio = 500.0 / orig_height
    resized = cv2.resize(image, (int(orig_width * ratio), 500))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    image_area = resized.shape[0] * resized.shape[1]

    # --- Generar varios mapas de bordes ---
    edge_maps = []

    # 1. Canny con distintos umbrales
    for lo, hi in [(10, 80), (20, 150), (30, 200), (50, 250)]:
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        edged = cv2.Canny(blurred, lo, hi)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        edge_maps.append(cv2.dilate(edged, k, iterations=2))

    # 2. Gradiente morfológico (muy bueno para documentos sobre mesa)
    k9 = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, k9)
    _, otsu = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    edge_maps.append(otsu)

    # 3. Threshold adaptativo
    blurred11 = cv2.GaussianBlur(gray, (11, 11), 0)
    adapt = cv2.adaptiveThreshold(blurred11, 255,
                                   cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                   cv2.THRESH_BINARY, 11, 2)
    k5 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edge_maps.append(cv2.dilate(cv2.bitwise_not(adapt), k5, iterations=1))

    # --- Buscar cuadrilátero en cada mapa ---
    best_contour = None  # fallback: mayor contorno encontrado

    for edged in edge_maps:
        contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL,
                                        cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]

        for c in contours:
            # Actualizar el contorno más grande para el fallback
            if best_contour is None or cv2.contourArea(c) > cv2.contourArea(best_contour):
                if cv2.contourArea(c) > image_area * 0.10:
                    best_contour = c

            peri = cv2.arcLength(c, True)
            # Probar varios valores de epsilon hasta encontrar un cuadrilátero
            for eps in [0.02, 0.03, 0.04, 0.05, 0.06, 0.08]:
                approx = cv2.approxPolyDP(c, eps * peri, True)
                if len(approx) == 4:
                    area = cv2.contourArea(approx)
                    if area > image_area * 0.15:  # al menos 15 % de la imagen
                        print(f"   ✓ Documento detectado (eps={eps}, área={area/image_area:.0%})")
                        return approx.reshape(4, 2) / ratio

    # --- Fallback: bounding rect del contorno más grande ---
    if best_contour is not None:
        x, y, w, h = cv2.boundingRect(best_contour)
        # Añadir margen del 1 % para no cortar bordes del documento
        pad = int(min(resized.shape[0], resized.shape[1]) * 0.01)
        x = max(0, x - pad)
        y = max(0, y - pad)
        w = min(resized.shape[1] - x, w + pad * 2)
        h = min(resized.shape[0] - y, h + pad * 2)
        corners = np.array([
            [x,     y    ],
            [x + w, y    ],
            [x + w, y + h],
            [x,     y + h]
        ], dtype='float32') / ratio
        print(f"   ⚠ Usando bounding-rect como fallback ({w}x{h} en imagen {resized.shape[1]}x{resized.shape[0]})")
        return corners

    raise ValueError("No se pudo detectar el documento en la imagen")

def process_document(image_bytes, document_type='PADRON', qr_image_bytes=None):
    """
    Procesar documento completo:
    1. Detectar documento
    2. Corregir perspectiva
    3. Convertir a fotocopia (blanco/negro)
    4. Separar triplicados si aplica
    5. Buscar QR code (manual con qr_image_bytes o automático)
    """
    print(f"\n{'='*50}")
    print(f"PROCESAMIENTO OPENCV - {document_type}")
    print(f"{'='*50}")
    print("✅ Usuario editó: ROTACIÓN y RECORTE en frontend")
    if qr_image_bytes:
        print("📱 OpenCV hace: LIMPIEZA + QR MANUAL (usuario recortó QR)")
    else:
        print("📷 OpenCV hace: LIMPIEZA + QR AUTO (perspectiva opcional)")
    
    # Leer imagen desde bytes
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if image is None:
        raise ValueError("No se pudo leer la imagen")
    
    print(f"[1/5] Imagen cargada: {image.shape[1]}x{image.shape[0]}")
    
    # PASO 1: Intentar corrección de perspectiva (OPCIONAL)
    print("[2/5] Verificando perspectiva...")
    warped = image.copy()  # Por defecto, usar imagen tal cual viene
    
    try:
        corners = detect_document(image)
        print("   ✓ Bordes detectados - aplicando corrección de perspectiva")
        warped = four_point_transform(image, corners)
        print(f"   ✓ Perspectiva corregida: {warped.shape[1]}x{warped.shape[0]}")
    except Exception as e:
        print(f"   ℹ️ Perspectiva no detectada (imagen ya viene recortada)")
        print(f"   → Usando imagen del frontend tal cual")
    
    # PASO 2B: Versión COLOR (recortada y nítida, sin conversión a gris)
    print("[2B/5] Preparando versión a color...")
    kernel_sharpen_color = np.array([
        [-1, -1, -1],
        [-1,  9, -1],
        [-1, -1, -1]
    ])
    color_sharpened = cv2.filter2D(warped, -1, kernel_sharpen_color)
    color_sharpened = np.clip(color_sharpened, 0, 255).astype(np.uint8)

    MULTI_COPY_TYPES = ['PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP', 'REVISION', 'PERMISO']
    if document_type in MULTI_COPY_TYPES:
        ch, cw = color_sharpened.shape[:2]
        ratio_hw = ch / max(cw, 1)
        if ratio_hw > 1.2:      # cuadruplicado (A4 con 4 copias)
            sp = ch // 4
            color_cert = color_sharpened[sp:sp*2, :]
            print(f"   ✓ Cuadruplicado detectado (H/W={ratio_hw:.2f}), extrayendo copia 2")
        elif ratio_hw > 0.8:    # triplicado (~cuadrado)
            sp = ch // 3
            color_cert = color_sharpened[sp:sp*2, :]
            print(f"   ✓ Triplicado detectado (H/W={ratio_hw:.2f}), extrayendo copia central")
        else:                   # ya recortado a una copia
            color_cert = color_sharpened
            print(f"   ✓ Copia individual (H/W={ratio_hw:.2f})")
    else:
        color_cert = color_sharpened

    color_tw = 1200
    color_scale = color_tw / color_cert.shape[1]
    color_th = int(color_cert.shape[0] * color_scale)
    color_final = cv2.resize(color_cert, (color_tw, color_th), interpolation=cv2.INTER_LANCZOS4)
    print(f"   ✓ Color listo: {color_tw}x{color_th}")

    # PASO 2: Mejorar imagen (sin threshold - preservar escala de grises)
    print("[3/5] Mejorando calidad de imagen...")
    gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)
    
    # 1. Denoising suave para eliminar ruido
    denoised = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    
    # 2. Mejorar contraste con CLAHE (MÁS FUERTE para evitar opacidad)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    
    # 3. Sharpening MÁS AGRESIVO para mejorar nitidez
    kernel_sharpen = np.array([
        [-1, -1, -1],
        [-1,  9, -1],
        [-1, -1, -1]
    ])
    sharpened = cv2.filter2D(enhanced, -1, kernel_sharpen)
    
    # Limitar valores para evitar oversaturation
    processed = np.clip(sharpened, 0, 255).astype(np.uint8)
    
    print("   ✓ Imagen mejorada: denoising + contraste FUERTE + nitidez ALTA")
    print("   ✓ Formato: Escala de grises contrastada")
    
    # PASO 3: Separar multicopia si aplica
    print("[4/5] Procesando formato...")
    MULTI_COPY_TYPES = ['PERMISO_CIRCULACION', 'REVISION_TECNICA', 'SOAP', 'REVISION', 'PERMISO']
    if document_type in MULTI_COPY_TYPES:
        ph, pw = processed.shape[:2]
        ratio_hw = ph / max(pw, 1)
        if ratio_hw > 1.2:      # cuadruplicado
            sp = ph // 4
            certificate = processed[sp:sp*2, :]
            print(f"   ✓ Cuadruplicado: extrayendo copia 2 ({certificate.shape[1]}x{certificate.shape[0]})")
        elif ratio_hw > 0.8:    # triplicado
            sp = ph // 3
            certificate = processed[sp:sp*2, :]
            print(f"   ✓ Triplicado: extrayendo copia central ({certificate.shape[1]}x{certificate.shape[0]})")
        else:                   # ya recortado
            certificate = processed
            print(f"   ✓ Copia individual (H/W={ratio_hw:.2f})")
        qr_source = certificate
    else:
        certificate = processed
        qr_source = processed
        print("   Sin multicopia (Padrón)")
    
    # Redimensionar a tamaño estándar
    target_width = 1200
    scale = target_width / certificate.shape[1]
    target_height = int(certificate.shape[0] * scale)
    
    final = cv2.resize(certificate, (target_width, target_height), interpolation=cv2.INTER_AREA)
    print(f"   ✓ Redimensionado a {target_width}x{target_height}")
    
    # PASO 4: Buscar QR code con MULTI-ESTRATEGIA
    print("[5/5] Buscando código QR...")
    qr_image = None
    qr_data = None
    
    # NUEVO: Si viene recorte manual de QR, usarlo preferentemente
    if qr_image_bytes:
        print("   📱 Procesando recorte manual de QR...")
        try:
            nparr_qr = np.frombuffer(qr_image_bytes, np.uint8)
            qr_manual_bgr = cv2.imdecode(nparr_qr, cv2.IMREAD_COLOR)
            if qr_manual_bgr is not None:
                # MEJORA: Re-escalar si es muy pequeño para ayudar a pyzbar
                h_m, w_m = qr_manual_bgr.shape[:2]
                if w_m < 600 or h_m < 600:
                    scale_m = 600 / min(w_m, h_m)
                    qr_manual_bgr = cv2.resize(qr_manual_bgr, None, fx=scale_m, fy=scale_m, interpolation=cv2.INTER_CUBIC)
                    print(f"   ✓ Re-escalado manual QR de {w_m}x{h_m} a {qr_manual_bgr.shape[1]}x{qr_manual_bgr.shape[0]}")
                
                # MEJORA 2: Añadir margen blanco (Quiet Zone técnica para QR)
                qr_manual_bgr = cv2.copyMakeBorder(qr_manual_bgr, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=[255, 255, 255])
                
                # Usar el recorte manual como fuente para las estrategias
                qr_source = cv2.cvtColor(qr_manual_bgr, cv2.COLOR_BGR2GRAY)
                # Establecer qr_image por defecto
                qr_image = cv2.resize(qr_manual_bgr, (400, 400), interpolation=cv2.INTER_AREA)
                print("   ✓ Usando recorte manual optimizado")
            else:
                print("   ⚠️ No se pudo decodificar el recorte manual de QR")
        except Exception as e:
            print(f"   ⚠️ Error cargando QR manual: {str(e)}")

    # Preparar múltiples estrategias (usando qr_source, que ahora puede ser el manual)
    strategies = []
    
    # Estrategia 1: Imagen mejorada original
    strategies.append(("Imagen original", qr_source.copy()))
    
    # Estrategia 2: INVERTIR colores (MUY IMPORTANTE para algunos QR)
    inverted = cv2.bitwise_not(qr_source)
    strategies.append(("Invertido (blanco/negro)", inverted))
    
    # Estrategia 3: Threshold binario simple
    _, binary = cv2.threshold(qr_source, 127, 255, cv2.THRESH_BINARY)
    strategies.append(("Threshold binario", binary))
    
    # Estrategia 4: Threshold binario invertido
    _, binary_inv = cv2.threshold(qr_source, 127, 255, cv2.THRESH_BINARY_INV)
    strategies.append(("Threshold binario invertido", binary_inv))
    
    # Estrategia 5: Otsu threshold (automático)
    _, otsu = cv2.threshold(qr_source, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    strategies.append(("Otsu threshold", otsu))
    
    # Estrategia 6: Threshold adaptativo
    adaptive = cv2.adaptiveThreshold(
        qr_source, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
    )
    strategies.append(("Threshold adaptativo", adaptive))
    
    # Intentar todas las estrategias (ahora 8 total)
    decoded_objects = []
    
    # MEJORA: Añadir estrategias de AFILADO y BLUR para códigos borrosos o ruidosos
    # Estrategia 7: Sharpening (enfocar)
    kernel_sharpen = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(qr_source, -1, kernel_sharpen)
    strategies.append(("Imagen enfocada (sharpen)", sharpened))
    
    # Estrategia 8: Gaussian Blur (suavizar ruido)
    blurred_qr = cv2.GaussianBlur(qr_source, (3, 3), 0)
    strategies.append(("Desenfoque ligero", blurred_qr))

    try:
        for strategy_name, img_to_test in strategies:
            print(f"   Probando: {strategy_name}...")
            
            # Convertir a PIL para pyzbar
            pil_image = Image.fromarray(img_to_test)
            
            # Detectar QR
            decoded_objects = pyzbar.decode(pil_image)
            
            if decoded_objects:
                qr_obj = decoded_objects[0]
                qr_data = qr_obj.data.decode('utf-8')
                
                # Extraer región del QR con MARGEN MÍNIMO
                x, y, w, h = qr_obj.rect
                margin = 5  # Margen mínimo para recorte ajustado
                x = max(0, x - margin)
                y = max(0, y - margin)
                w = min(img_to_test.shape[1] - x, w + margin * 2)
                h = min(img_to_test.shape[0] - y, h + margin * 2)
                
                qr_region = img_to_test[y:y+h, x:x+w]
                qr_image = cv2.resize(qr_region, (400, 400), interpolation=cv2.INTER_CUBIC)
                
                print(f"   ✅ QR detectado con: {strategy_name}")
                print(f"   ✅ Contenido: {qr_data[:60]}...")
                break  # Salir del loop si encontramos el QR
        
        if not decoded_objects or not qr_data:
            print("   ⚠️ No se detectó QR con ninguna de las 6 estrategias")
            print(f"   ℹ️ Región QR size: {qr_source.shape}")
            
    except Exception as e:
        print(f"   ⚠️ Error buscando QR: {str(e)}")
    
    # Generar thumbnail
    thumbnail = cv2.resize(final, (400, 300), interpolation=cv2.INTER_AREA)
    
    print(f"\n✅ Procesamiento completado")
    print(f"{'='*50}\n")
    
    return {
        'processed': final,
        'color_processed': color_final,
        'qr_image': qr_image,
        'qr_data': qr_data,
        'thumbnail': thumbnail,
        'metadata': {
            'width': final.shape[1],
            'height': final.shape[0],
            'has_qr': qr_data is not None
        }
    }

def encode_image_to_bytes(image, format='JPEG', quality=95):
    """
    Convertir imagen numpy a bytes
    """
    if format == 'PNG':
        encode_param = [int(cv2.IMWRITE_PNG_COMPRESSION), 9]
        ext = '.png'
    else:
        encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), quality]
        ext = '.jpg'
    
    success, encoded = cv2.imencode(ext, image, encode_param)
    
    if not success:
        raise ValueError("Error codificando imagen")
    
    return encoded.tobytes()
