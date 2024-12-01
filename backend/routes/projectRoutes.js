const express = require("express");
const { getUserProjects, createProject } = require("../controllers/projectController");
const { verifyToken } = require("../controllers/authController");

const router = express.Router();

// 프로젝트 목록 조회
router.get("/", verifyToken, getUserProjects);

// 새 프로젝트 생성
router.post("/", verifyToken, createProject);

module.exports = router;