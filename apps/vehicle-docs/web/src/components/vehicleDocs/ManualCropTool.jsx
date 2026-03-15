import { useState, useRef, useEffect } from 'react'
import { Check, ZoomIn } from 'lucide-react'

const HS = 14 // handle size px

export default function ManualCropTool({ imageFile, onConfirm, onSkip }) {
    const imgRef = useRef(null)
    const [url, setUrl] = useState(null)
    const [display, setDisplay] = useState({ w: 0, h: 0 })
    const [crop, setCrop] = useState(null)
    const dragRef = useRef(null) // { type, sx, sy, sc }

    useEffect(() => {
        const u = URL.createObjectURL(imageFile)
        setUrl(u)
        return () => URL.revokeObjectURL(u)
    }, [imageFile])

    const onLoad = (e) => {
        const img = e.target
        const w = img.clientWidth
        const h = img.clientHeight
        setDisplay({ w, h })
        const pad = Math.min(w, h) * 0.05
        setCrop({ x: pad, y: pad, w: w - pad * 2, h: h - pad * 2 })
    }

    const pt = (e) => {
        const rect = imgRef.current.getBoundingClientRect()
        const src = e.touches ? e.touches[0] : e
        return { x: src.clientX - rect.left, y: src.clientY - rect.top }
    }

    const hit = (px, py) => {
        if (!crop) return null
        const { x, y, w, h } = crop
        const corners = [
            { id: 'tl', cx: x,     cy: y     },
            { id: 'tr', cx: x + w, cy: y     },
            { id: 'br', cx: x + w, cy: y + h },
            { id: 'bl', cx: x,     cy: y + h },
        ]
        for (const { id, cx, cy } of corners)
            if (Math.abs(px - cx) <= HS && Math.abs(py - cy) <= HS) return id

        const edges = [
            { id: 'top',    cx: x + w / 2, cy: y         },
            { id: 'right',  cx: x + w,     cy: y + h / 2 },
            { id: 'bottom', cx: x + w / 2, cy: y + h     },
            { id: 'left',   cx: x,         cy: y + h / 2 },
        ]
        for (const { id, cx, cy } of edges)
            if (Math.abs(px - cx) <= HS && Math.abs(py - cy) <= HS) return id

        if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move'
        return null
    }

    const onDown = (e) => {
        if (!crop) return
        e.preventDefault()
        const p = pt(e)
        const type = hit(p.x, p.y)
        if (!type) return
        dragRef.current = { type, sx: p.x, sy: p.y, sc: { ...crop } }
    }

    const onMove = (e) => {
        if (!dragRef.current || !crop) return
        e.preventDefault()
        const p = pt(e)
        const { type, sx, sy, sc } = dragRef.current
        const dx = p.x - sx
        const dy = p.y - sy
        const iw = display.w
        const ih = display.h
        const min = 40
        let { x, y, w, h } = sc

        if (type === 'move') {
            x = Math.max(0, Math.min(iw - w, sc.x + dx))
            y = Math.max(0, Math.min(ih - h, sc.y + dy))
        } else {
            if (type === 'tl' || type === 'bl' || type === 'left') {
                const nx = Math.max(0, Math.min(sc.x + sc.w - min, sc.x + dx))
                w = sc.x + sc.w - nx; x = nx
            }
            if (type === 'tr' || type === 'br' || type === 'right')
                w = Math.max(min, Math.min(iw - sc.x, sc.w + dx))
            if (type === 'tl' || type === 'tr' || type === 'top') {
                const ny = Math.max(0, Math.min(sc.y + sc.h - min, sc.y + dy))
                h = sc.y + sc.h - ny; y = ny
            }
            if (type === 'bl' || type === 'br' || type === 'bottom')
                h = Math.max(min, Math.min(ih - sc.y, sc.h + dy))
        }
        setCrop({ x, y, w, h })
    }

    const onUp = () => { dragRef.current = null }

    const apply = () => {
        if (!crop || !imgRef.current) return
        const img = imgRef.current
        const sx = img.naturalWidth / img.clientWidth
        const sy = img.naturalHeight / img.clientHeight
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(crop.w * sx)
        canvas.height = Math.round(crop.h * sy)
        canvas.getContext('2d').drawImage(
            img,
            Math.round(crop.x * sx), Math.round(crop.y * sy),
            canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
        )
        canvas.toBlob(blob => {
            if (blob) onConfirm(new File([blob], imageFile.name || 'cropped.jpg', { type: 'image/jpeg' }))
        }, 'image/jpeg', 0.95)
    }

    return (
        <div className="select-none space-y-3">
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1">
                <ZoomIn className="w-3.5 h-3.5" /> Arrastra los handles para ajustar el recorte
            </p>

            <div
                className="relative overflow-hidden rounded-xl bg-black touch-none"
                style={{ cursor: dragRef.current?.type === 'move' ? 'move' : 'crosshair' }}
                onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
                onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            >
                <img
                    ref={imgRef}
                    src={url}
                    alt="Recortar"
                    className="w-full block"
                    onLoad={onLoad}
                    draggable={false}
                />

                {crop && display.w > 0 && (
                    <svg className="absolute inset-0 pointer-events-none"
                        width={display.w} height={display.h}
                        style={{ position: 'absolute', top: 0, left: 0 }}>

                        {/* Overlay oscuro fuera del recorte */}
                        <rect x={0} y={0} width={display.w} height={crop.y} fill="rgba(0,0,0,0.6)" />
                        <rect x={0} y={crop.y + crop.h} width={display.w} height={display.h - crop.y - crop.h} fill="rgba(0,0,0,0.6)" />
                        <rect x={0} y={crop.y} width={crop.x} height={crop.h} fill="rgba(0,0,0,0.6)" />
                        <rect x={crop.x + crop.w} y={crop.y} width={display.w - crop.x - crop.w} height={crop.h} fill="rgba(0,0,0,0.6)" />

                        {/* Borde del recorte */}
                        <rect x={crop.x} y={crop.y} width={crop.w} height={crop.h}
                            fill="none" stroke="white" strokeWidth="1.5" />

                        {/* Líneas de tercios */}
                        {[1, 2].map(i => (
                            <g key={i}>
                                <line x1={crop.x + crop.w * i / 3} y1={crop.y}
                                    x2={crop.x + crop.w * i / 3} y2={crop.y + crop.h}
                                    stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                                <line x1={crop.x} y1={crop.y + crop.h * i / 3}
                                    x2={crop.x + crop.w} y2={crop.y + crop.h * i / 3}
                                    stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
                            </g>
                        ))}

                        {/* Handles de esquinas */}
                        {[[crop.x, crop.y], [crop.x + crop.w, crop.y],
                          [crop.x + crop.w, crop.y + crop.h], [crop.x, crop.y + crop.h]
                        ].map(([cx, cy], i) => (
                            <rect key={i}
                                x={cx - HS / 2} y={cy - HS / 2} width={HS} height={HS}
                                fill="white" stroke="rgba(79,70,229,0.8)" strokeWidth="2" rx="3" />
                        ))}

                        {/* Handles de bordes */}
                        {[[crop.x + crop.w / 2, crop.y],
                          [crop.x + crop.w, crop.y + crop.h / 2],
                          [crop.x + crop.w / 2, crop.y + crop.h],
                          [crop.x, crop.y + crop.h / 2]
                        ].map(([cx, cy], i) => (
                            <circle key={i} cx={cx} cy={cy} r={HS / 2 - 1}
                                fill="white" stroke="rgba(79,70,229,0.8)" strokeWidth="2" />
                        ))}
                    </svg>
                )}
            </div>

            <div className="flex gap-3">
                <button onClick={apply}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                    <Check className="w-4 h-4" /> Aplicar Recorte
                </button>
                <button onClick={onSkip}
                    className="px-5 py-3 text-gray-400 hover:text-gray-700 font-black uppercase tracking-widest text-xs transition-all">
                    Sin recorte
                </button>
            </div>
        </div>
    )
}
