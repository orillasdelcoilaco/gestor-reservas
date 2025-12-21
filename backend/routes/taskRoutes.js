const express = require('express');
const taskController = require('../controllers/taskController');

/**
 * Task Routes
 * Base Path: /api/task-types (mounted in index.js)
 */
const taskRoutes = (db) => {
    const router = express.Router();
    const controller = taskController(db);

    router.get('/', controller.getTaskTypes);
    router.post('/', controller.saveTaskType);
    router.delete('/:id', controller.deleteTaskType);

    return router;
};

module.exports = taskRoutes;
