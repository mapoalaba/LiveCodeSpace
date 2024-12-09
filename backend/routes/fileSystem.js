// routes/fileSystem.js
const express = require('express');
const { verifyToken } = require('../controllers/authController');
const {
  createItem,
  getChildren,
  renameItem,
  deleteItem,
  getFileContent,
  saveFileContent,
  moveItem,
  searchItems
} = require('../controllers/fileSystemController');

const router = express.Router();

router.post('/:projectId/items', verifyToken, createItem);
router.get('/:projectId/items', verifyToken, getChildren);
router.put('/items/:id/rename', verifyToken, renameItem);
router.delete('/items/:id', verifyToken, deleteItem);
router.get('/items/:id/content', verifyToken, getFileContent);
router.put('/items/:id/content', verifyToken, saveFileContent);
router.put('/items/:id/move', verifyToken, moveItem);
router.get('/:projectId/search', verifyToken, searchItems);

module.exports = router;