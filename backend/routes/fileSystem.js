// routes/fileSystem.js
const express = require('express');
const { verifyToken } = require('../controllers/authController');
const {
  createItem,
  getChildren,
  renameItem,
  deleteItem,
  getFileContent,
  saveFileContent
} = require('../controllers/fileSystemController');

const router = express.Router();

router.post('/:projectId/items', verifyToken, createItem);
router.get('/:projectId/items', verifyToken, getChildren);
router.put('/items/:id/rename', verifyToken, renameItem);
router.delete('/items/:id', verifyToken, deleteItem);
router.get('/items/:id/content', verifyToken, getFileContent);
router.put('/items/:id/content', verifyToken, saveFileContent);

module.exports = router;