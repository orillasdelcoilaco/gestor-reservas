require('dotenv').config();
const fs = require('fs');

const keys = Object.keys(process.env).filter(k =>
    k.includes('KEY') || k.includes('GEMINI') || k.includes('API') || k.includes('TOKEN')
);

const report = keys.map(k => ({
    key: k,
    length: process.env[k] ? process.env[k].length : 0,
    firstChar: process.env[k] ? process.env[k][0] : null
}));

console.log("Reporte:", report);
fs.writeFileSync('env_len_report.json', JSON.stringify(report, null, 2));
