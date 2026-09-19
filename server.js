const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Phục vụ tệp giao diện index.html
app.use(express.static(path.join(__dirname)));

// Endpoint trung gian gọi API OKX
app.get('/api/okx/ticker', async (req, res) => {
  try {
    const instId = req.query.instId || 'BTC-USDT';
    const response = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`, {
      headers: {
        // Nhận API key bảo mật từ biến môi trường của Render
        'OK-ACCESS-KEY': process.env.OKX_API_KEY || ''
      }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
});
