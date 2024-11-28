const express = require("express");
const {
  register,
  login,
  getUserProfile,
  verifyToken,
  verifyEmail,
  resendConfirmationCode,
} = require("../controllers/authController");

const router = express.Router();

// 회원가입
router.post("/register", register);

// 로그인
router.post("/login", login);

// 사용자 프로필 조회 (JWT 인증 필요)
router.get("/profile", verifyToken, getUserProfile);

// 이메일 확인 (Confirmation Code 입력)
router.post("/verify", verifyEmail);

// 확인 코드 재전송
router.post("/resend-code", resendConfirmationCode);

module.exports = router;