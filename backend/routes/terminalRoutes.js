// routes/terminalRoutes.js
const express = require('express');
const router = express.Router();
const terminalController = require('../controllers/terminalController');

// 터미널 세션 생성
router.post('/create', async (req, res) => {
    console.log('터미널 세션 생성 요청:', req.body);
    try {
        const { projectId } = req.body;
        const containerId = await terminalController.createContainer(projectId);
        console.log('생성된 컨테이너 ID:', containerId);
        res.json({ success: true, containerId });
    } catch (error) {
        console.error('터미널 세션 생성 실패:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 터미널 세션 종료
router.post('/terminate', async (req, res) => {
    console.log('터미널 세션 종료 요청:', req.body);
    try {
        const { containerId } = req.body;
        await terminalController.terminateContainer(containerId);
        console.log('컨테이너 종료 완료:', containerId);
        res.json({ success: true });
    } catch (error) {
        console.error('터미널 세션 종료 실패:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;