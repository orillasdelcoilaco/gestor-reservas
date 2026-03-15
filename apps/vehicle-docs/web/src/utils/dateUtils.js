/**
 * Normalizes various date formats to YYYY-MM-DD (ISO 8601).
 * Handles Spanish month names (full and abbreviated).
 * Handles month-only dates like "JULIO 2026" → last day of that month.
 * @param {string|null} d - raw date string
 * @returns {string|null}
 */
export const normalizeDate = (d) => {
    if (!d) return null;
    const ds = String(d).trim().toUpperCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) return ds;

    const months = {
        // Full names
        'ENERO': '01', 'FEBRERO': '02', 'MARZO': '03', 'ABRIL': '04',
        'MAYO': '05', 'JUNIO': '06', 'JULIO': '07', 'AGOSTO': '08',
        'SEPTIEMBRE': '09', 'OCTUBRE': '10', 'NOVIEMBRE': '11', 'DICIEMBRE': '12',
        // Abbreviations
        'ENE': '01', 'FEB': '02', 'MAR': '03', 'ABR': '04', 'MAY': '05', 'JUN': '06',
        'JUL': '07', 'AGO': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DIC': '12'
    };

    // Last day of each month (non-leap year default; leap years handled dynamically)
    const lastDay = (monthNum, year) => {
        return new Date(Number(year), Number(monthNum), 0).getDate();
    };

    const parts = ds.split(/[\s\-/,]+/).filter(Boolean);

    if (parts.length === 2) {
        // "JULIO 2026" or "07 2026" — month + year only → last day of month
        const [a, b] = parts;
        const monthStr = months[a] || (months[b] ? months[b] : null);
        const yearStr = /^\d{4}$/.test(b) ? b : (/^\d{4}$/.test(a) ? a : null);
        if (monthStr && yearStr) {
            const day = String(lastDay(monthStr, yearStr)).padStart(2, '0');
            return `${yearStr}-${monthStr}-${day}`;
        }
    }

    if (parts.length === 3) {
        let [p0, p1, p2] = parts;

        // Normalize month token
        const resolveMonth = (t) => months[t] || (/^\d+$/.test(t) ? t.padStart(2, '0') : null);

        let day, month, year;

        if (p0.length === 4 && /^\d+$/.test(p0)) {
            // "YYYY-MM-DD" or "YYYY-MON-DD"
            year = p0; month = resolveMonth(p1); day = p2.padStart(2, '0');
        } else {
            // "DD-MM-YYYY" or "DD-MON-YYYY"
            day = p0.padStart(2, '0'); month = resolveMonth(p1); year = p2;
        }

        if (year?.length === 4 && month && /^\d+$/.test(day)) {
            return `${year}-${month}-${day}`;
        }
    }

    return ds;
};
