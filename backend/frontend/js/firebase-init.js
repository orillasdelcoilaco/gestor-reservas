// backend/frontend/js/firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC_9_hrjyOLnBIARguITiY80Eg1riKjdCE",
    authDomain: "reservas-sodc.firebaseapp.com",
    projectId: "reservas-sodc",
    storageBucket: "reservas-sodc.firebasestorage.app",
    messagingSenderId: "177883383809",
    appId: "1:177883383809:web:329694a3dc2df074f7d800"
};

import { getStorage } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Activar persistencia offline
try {
    enableIndexedDbPersistence(db)
        .then(() => {
            console.log('[Firebase] Persistencia offline habilitada');
        })
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('[Firebase] Persistencia falló: Multiples pestañas abiertas.');
            } else if (err.code == 'unimplemented') {
                console.warn('[Firebase] El navegador no soporta persistencia.');
            }
        });
} catch (e) {
    console.error('[Firebase] Error activando persistencia:', e);
}

export { app, auth, db, storage };
