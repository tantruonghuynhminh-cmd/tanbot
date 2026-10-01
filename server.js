const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Trạng thái Auto Trade chạy ngầm trên Server
let isAutoTradeRunning = false;

app.use(express.json());
// Phục vụ tệp giao diện tĩnh
app.use(express.static(path.join(__dirname)));

// Hàm tạo chữ ký HMAC-SHA256 cho OKX Private API
function generateOkxSignature(timestamp, method, requestPath, body = '') {
  const secretKey = process.env.OKX_SECRET_KEY || '';
  const message = timestamp + method.toUpperCase() + requestPath + body;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

// ----------------------------------------------------
// 0. ENDPOINTS QUẢN LÝ AUTOTRADE & HEALTH CHECK
// ----------------------------------------------------

// Health Check cho UptimeRobot
app.get('/health', (req, res) => {
  res.status(200).send('OK - Bot is running');
});

// Lấy trạng thái Auto Trade hiện tại (Giải quyết lỗi 404 từ Frontend)
app.get('/api/autotrade/status', (req, res) => {
  res.json({ success: true, running: isAutoTradeRunning });
});

// Bật/Tắt Auto Trade từ giao diện
app.post('/api/autotrade/toggle', (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled === 'boolean') {
    isAutoTradeRunning = enabled;
    console.log(`[BOT] Auto Trade đã được: ${isAutoTradeRunning ? 'BẬT 🟢' : 'TẮT 🔴'}`);
  } else {
    isAutoTradeRunning = !isAutoTradeRunning;
  }
  res.json({ success: true, running: isAutoTradeRunning });
});

// ----------------------------------------------------
// 1. PUBLIC API: Lấy giá thị trường OKX
// ----------------------------------------------------
app.get('/api/okx/ticker', async (req, res) => {
  try {
    const instId = req.query.instId || 'BTC-USDT';
    const response = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

// ----------------------------------------------------
// 2. PRIVATE API: Lấy số dư tài khoản
// ----------------------------------------------------
app.get('/api/okx/balance', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const method = 'GET';
    const requestPath = '/api/v5/account/balance';

    const signature = generateOkxSignature(timestamp, method, requestPath);

    const response = await axios.get(`https://www.okx.com${requestPath}`, {
      headers: {
        'OK-ACCESS-KEY': process.env.OKX_API_KEY || '',
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || '',
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

// ----------------------------------------------------
// 3. PRIVATE API: Đặt lệnh giao dịch
// ----------------------------------------------------
app.post('/api/okx/order', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    const method = 'POST';
    const requestPath = '/api/v5/trade/order';
    const bodyString = JSON.stringify(req.body);

    const signature = generateOkxSignature(timestamp, method, requestPath, bodyString);

    const response = await axios.post(`https://www.okx.com${requestPath}`, req.body, {
      headers: {
        'OK-ACCESS-KEY': process.env.OKX_API_KEY || '',
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || '',
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

// ----------------------------------------------------
// 4. PROXY CHUNG DÀNH CHO FRONTEND GỌI MỌI API OKX
// ----------------------------------------------------
app.use('/api/okx-proxy/*', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace('/api/okx-proxy', '/api/v5');
    const method = req.method;
    const timestamp = new Date().toISOString();
    let bodyString = '';

    if (method !== 'GET' && method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      bodyString = JSON.stringify(req.body);
    }

    const signature = generateOkxSignature(timestamp, method, targetPath, bodyString);

    const headers = {
      'OK-ACCESS-KEY': process.env.OKX_API_KEY || '',
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': process.env.OKX_PASSPHRASE || '',
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
    res.status(error.response?.status || 500).json({ error: error.response ? error.response.data : error.message });
  }
});

/* ========================================================
   VÒNG LẶP NGHẦM CHẠY TRÊN RENDER (24/7)
   ======================================================== */
async function startServerAutoTradeLoop() {
  console.log("🚀 Server Bot đang chạy ngầm 24/7 trên Render...");
  
  while (true) {
    try {
      if (isAutoTradeRunning) {
        // Thực hiện logic quyét/đặt lệnh ngầm tại đây nếu có
        // console.log("[AUTO TRADE] Đang quét thị trường...");
      }
      
      // Giữ nhịp quét 2 phút/lần (120,000 ms)
      await new Promise(resolve => setTimeout(resolve, 120000));
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
