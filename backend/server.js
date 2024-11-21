const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: 8080 });

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    // 실시간 데이터 브로드캐스트
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
});

const app = express();
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Backend is running on Mac!");
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));