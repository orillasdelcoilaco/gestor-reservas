// backend/services/notificationService.js
const TelegramBot = require('node-telegram-bot-api');
const { getSettings } = require('./settingsService');

// Variable global para cachear la instancia del bot y evitar reinicializarlo en cada llamada
let botInstance = null;
let currentToken = null;

async function getBot(db) {
    const settings = await getSettings(db);
    let token = settings.botToken || process.env.TELEGRAM_TOKEN;

    if (!token) {
        console.warn('[NotificationService] No bot token found in settings or ENV.');
        return null;
    }
    console.log(`[NotificationService] Bot Token found. Length: ${token.length}, Prefix: ${token.substring(0, 5)}...`);

    // Clean quotes just in case
    token = token.replace(/^"|"$/g, '').trim();

    if (botInstance && currentToken === token) {
        return botInstance;
    }

    // Nueva instancia
    // polling: false porque solo enviamos mensajes (webhook o push only)
    // Fix EFATAL: AggregateError by forcing IPv4 (Node 17+ issue)
    botInstance = new TelegramBot(token, {
        polling: false,
        request: {
            agentOptions: {
                keepAlive: true,
                family: 4
            }
        }
    });
    currentToken = token;
    return botInstance;
}


/**
 * Servicio paramétrico de notificaciones con Debounce/Agregación.
 */
async function sendAlert(db, mensaje, incidentData) {
    try {
        // 1. Obtener configuración
        const settings = await getSettings(db);
        const { telegramChatId, adminNombre } = settings; // adminChatId

        // 2. Lógica de Agregación (Debounce) - MANTENIDA
        let finalMessage = mensaje;
        let shouldSend = true;

        if (incidentData && incidentData.cabanaId) {
            const incidentsService = require('./incidentsService');
            // Try/Catch for optional dependency to avoid circular req issues if any
            try {
                const recent = await incidentsService.getRecentIncidentsForCabin(db, incidentData.cabanaId, 5);
                if (recent.length === 3) {
                    finalMessage = `🚨 *ALERTA CRÍTICA*: Se han reportado 3 incidencias consecutivas en ${incidentData.cabanaId} en los últimos 5 minutos. Revisar situación general.`;
                } else if (recent.length > 3) {
                    // Silenciar alertas subsiguientes
                    shouldSend = false;
                }
            } catch (e) {
                console.warn('Error en debounce logic', e);
            }
        }

        if (!shouldSend) return { sent: false, reason: 'aggregated_debounce' };

        // 3. Formatear
        const timestamp = new Date().toLocaleString('es-CL');
        // Markdown parsing for Telegram
        const formattedMsg = finalMessage === mensaje
            ? `🚨 *[URGENTE]* ${timestamp}\nHola ${adminNombre || 'Admin'},\n\n${mensaje}`
            : `🛑 *[AGREGACIÓN]* ${timestamp}\n\n${finalMessage}`;

        const bot = await getBot(db);

        if (telegramChatId && bot) {
            console.log(`>>> Enviando a Telegram Admin (${telegramChatId})`);

            // Inline Keyboard para acciones rápidas
            const options = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📊 Ver Dashboard', url: 'https://gestor-reservas.onrender.com/dashboard.html' } // URL fija o parametrizable? Usaremos la de prod.
                        ]
                    ]
                }
            };

            await bot.sendMessage(telegramChatId, formattedMsg, options);
            return { sent: true, method: 'telegram' };
        } else {
            console.warn(`>>> No Telegram Bot Configured. Log:\n${formattedMsg}`);
            return { sent: false, reason: 'no_config' };
        }

    } catch (error) {
        console.error('[NotificationService] Error enviando alerta:', error);
        // Log error to Firestore?
        return { sent: false, error: error.message };
    }
}

async function sendDailyPlan(db, planResumen) {
    try {
        const settings = await getSettings(db);
        // Usamos workerChatId si existe, sino adminChatId como fallback para pruebas
        const targetChatId = settings.workerChatId || settings.telegramChatId;
        const bot = await getBot(db);

        if (targetChatId && bot) {
            const msg = `📋 *Plan Operativo Diario*\n\nHola,\nAquí tienes el resumen de tareas para hoy:\n${planResumen}\n\n¡Buen turno!`;
            const options = {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📱 Abrir Portal Operativo', url: 'https://gestor-reservas.onrender.com/portal-operativo.html' }
                        ]
                    ]
                }
            };
            await bot.sendMessage(targetChatId, msg, options);
            return { sent: true };
        }
    } catch (error) {
        console.error('[NotificationService] Error sending daily plan', error);
        return { sent: false, error: error.message };
    }
}

async function sendReportPdf(db, pdfBuffer, filename = 'reporte.pdf') {
    try {
        const settings = await getSettings(db);
        const targetChatId = settings.telegramChatId;
        const bot = await getBot(db);

        if (targetChatId && bot) {
            await bot.sendDocument(targetChatId, pdfBuffer, {}, {
                filename: filename,
                contentType: 'application/pdf'
            });
            return { sent: true };
        }
    } catch (error) {
        console.error('Error sending PDF', error);
        return { sent: false };
    }
}

// Helper to get Base URL (Production safe)
const getBaseUrl = () => process.env.BASE_URL || 'https://gestor-reservas.onrender.com';

async function sendDirectMessage(db, chatId, message, options = {}) {
    try {
        const bot = await getBot(db);
        if (!bot) {
            console.error('[NotificationService] Bot not initialized. Token missing? Check settings.botToken or ENV.');
            return { sent: false, reason: 'no_bot' };
        }
        console.log(`[NotificationService] Sending to ${chatId}. Bot ready.`);

        // Merge default parse_mode with custom options
        const opts = { parse_mode: 'Markdown', ...options };

        await bot.sendMessage(chatId, message, opts);
        return { sent: true };
    } catch (error) {
        console.error('Error sending direct Telegram message:', error);
        if (error.code === 'EFATAL') { // Common in telegram connection errors
            console.error('EFATAL Details:', error);
        }
        return { sent: false, error: error.message || 'Unknown Telegram Error' };
    }
}

async function enviarLinkPortal(db, workerId) {
    try {
        // 1. Get Worker
        const workerDoc = await db.collection('trabajadores').doc(workerId).get();
        if (!workerDoc.exists) throw new Error('Trabajador no encontrado');
        const worker = workerDoc.data();

        if (!worker.telegramChatId) throw new Error('Trabajador sin Telegram Chat ID');

        // 2. Generate Link
        const baseUrl = getBaseUrl();
        const portalUrl = `${baseUrl}/portal-operativo.html?workerId=${workerId}`;

        // 3. Send Message with Button
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '📱 Abrir Mi Portal de Trabajo', url: portalUrl }]
                ]
            }
        };

        return await sendDirectMessage(db, worker.telegramChatId, msg, opts);

    } catch (error) {
        console.error('Error enviarLinkPortal:', error);
        return { sent: false, error: error.message };
    }
}

// Explicit initialization for server startup
async function initTelegramBot(db) {
    await getBot(db);
}

module.exports = {
    sendAlert,
    sendDailyPlan,
    sendReportPdf,
    sendDirectMessage,
    enviarLinkPortal,
    initTelegramBot
};
