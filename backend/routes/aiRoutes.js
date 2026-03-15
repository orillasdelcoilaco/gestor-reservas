const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');

// POST /api/ai/ask
router.post('/ask', aiController.handleAiRequest);

module.exports = router;
