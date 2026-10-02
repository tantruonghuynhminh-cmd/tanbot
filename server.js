/* ========================================================
   server.js - BACKEND SERVER & PROXY (EXPRESS.JS)
   ======================================================== */
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

// Cấu hình thông tin API OKX (Ưu tiên Lấy từ biến môi trường Render)
const OKX_API_KEY = process.env.OKX_API_KEY || '7ffea234-8094-4f4c-91f6-1773d2370b5c';
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY || '55D97BC2B8E2457EAA62F6152BEE9C03';
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || 'Minhtantruong@1688';

const app = express();
const PORT = process.env.PORT || 3000;

// Tự định nghĩa Middleware CORS thủ công (tránh lỗi MODULE_NOT_FOUND cors trên Render)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Phục vụ tệp tĩnh và định tuyến trang chủ index.html
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ========================================================
   1. UTILS & SIGNATURE HELPERS
   ======================================================== */

// Hàm tạo chữ ký HMAC-SHA256 cho OKX Private API
function generateOkxSignature(timestamp, method, requestPath, body = '') {
  const message = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac('sha256', OKX_SECRET_KEY).update(message).digest('base64');
}

// Endpoint Health Check cho UptimeRobot giữ Render luôn chạy 24/7
app.get('/health', (req, res) => {
  res.status(200).send('OK - Bot is running');
});

/* ========================================================
   2. TRẠNG THÁI & API ĐIỀU KHIỂN BOT TRÊN SERVER
   ======================================================== */

let isTrading = false;
let topPump = [];
let topDump = [];
let activeOrders = {};
let tradeHistory = [];

// API: Bắt đầu Auto Trade
app.post('/api/autotrade/start', (req, res) => {
  isTrading = true;
  console.log('🚀 AUTO TRADE: ĐÃ BẬT');
  res.json({ ok: true, success: true, running: true });
});

// API: Dừng Auto Trade
app.post('/api/autotrade/stop', (req, res) => {
  isTrading = false;
  console.log('🛑 AUTO TRADE: ĐÃ TẮT');
  res.json({ ok: true, success: true, running: false });
});

// API: Toggle Bật/Tắt Bot
app.post('/api/bot/toggle', (req, res) => {
  const { enable } = req.body;
  isTrading = (typeof enable === 'boolean') ? enable : !isTrading;
  res.json({
    ok: true,
    success: true,
    running: isTrading,
    isTrading: isTrading,
    message: `Đã ${isTrading ? 'BẬT 🟢' : 'TẮT 🔴'} Auto Trade thành công.`
  });
});

// API: Lấy trạng thái bot (Hỗ trợ cả 2 đường dẫn mà frontend có thể gọi)
app.get(['/api/autotrade/status', '/api/bot/status'], (req, res) => {
  res.json({
    ok: true,
    success: true,
    running: isTrading,
    isTrading: isTrading,
    topPump: topPump,
    topDump: topDump,
    activeOrders: activeOrders,
    tradeHistory: tradeHistory
  });
});

/* ========================================================
   3. OKX DIRECT & PROXY API ENDPOINTS
   ======================================================== */

// PUBLIC API: Lấy giá thị trường
app.get('/api/okx/ticker', async (req, res) => {
  try {
    const instId = req.query.instId || 'BTC-USDT';
    const response = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

// PROXY CHUNG DÀNH CHO FRONTEND GỌI MỌI API OKX (Hỗ trợ cả Private & Public)
app.all('/api/okx-proxy/*', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace('/api/okx-proxy', '/api/v5');
    const method = req.method;
    const timestamp = new Date().toISOString();
    let bodyString = '';

    if (['POST', 'PUT', 'DELETE'].includes(method.toUpperCase()) && req.body && Object.keys(req.body).length > 0) {
      bodyString = JSON.stringify(req.body);
    }

    const signature = generateOkxSignature(timestamp, method, targetPath, bodyString);

    const headers = {
      'OK-ACCESS-KEY': OKX_API_KEY,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
      'Content-Type': 'application/json'
    };

    const axiosConfig = {
      method: method,
      url: `https://www.okx.com${targetPath}`,
      headers: headers
    };

    if (bodyString) {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);
    res.json(response.data);
  } catch (error) {
    console.error(`❌ Lỗi Proxy OKX [${req.originalUrl}]:`, error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

/* ========================================================
   4. VÒNG LẶP CHẠY NGẦM 24/7 TRÊN RENDER
   ======================================================== */
async function startServerAutoTradeLoop() {
  console.log("🚀 Server Bot đang chạy ngầm 24/7 trên Render...");
  while (true) {
    try {
      if (isTrading) {
        const response = await axios.get('https://www.okx.com/api/v5/market/tickers?instType=SWAP');
        if (response.data && response.data.data) {
          const usdtPairs = response.data.data.filter(item => item.instId.endsWith('-USDT-SWAP'));
          usdtPairs.sort((a, b) => parseFloat(b.chg24h || 0) - parseFloat(a.chg24h || 0));

          topPump = usdtPairs.slice(0, 5).map(item => ({ instId: item.instId, last: item.last, change24h: item.chg24h }));
          topDump = usdtPairs.slice(-5).reverse().map(item => ({ instId: item.instId, last: item.last, change24h: item.chg24h }));
        }
      }
      await new Promise(resolve => setTimeout(resolve, 20000));
    } catch (err) {
      console.error("Lỗi vòng lặp Server Bot:", err.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

app.listen(PORT, () => {
  console.log(`Server OKX Proxy đang chạy tại port ${PORT}`);
  startServerAutoTradeLoop();
});
