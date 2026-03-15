require('dotenv').config();
const fs = require('fs');

const keys = Object.keys(process.env).filter(k =>
    k.includes('KEY') || k.includes('GEMINI') || k.includes('API') || k.includes('TOKEN')
);

console.log("Claves encontradas:", keys);
fs.writeFileSync('env_keys.log', JSON.stringify(keys, null, 2));
