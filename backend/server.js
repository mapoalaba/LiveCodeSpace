require("dotenv").config(); // 환경 변수 설정
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");

const app = express();

// 미들웨어 설정
app.use(cors()); // CORS 활성화
app.use(bodyParser.json()); // JSON 요청 파싱
app.use(bodyParser.urlencoded({ extended: true })); // URL-encoded 요청 파싱

// 기본 라우트
app.get("/", (req, res) => {
  res.send("LiveCodeSpace Backend API is running.");
});

// 인증 관련 라우트
app.use("/api/auth", authRoutes);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "An unexpected error occurred." });
});

app.use((req, res, next) => {
  console.log(`Received request: ${req.method} ${req.path}`);
  next();
});

// 프로젝트
app.use("/api/projects", projectRoutes);

// 서버 시작
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});