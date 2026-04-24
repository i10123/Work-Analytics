const axios = require('axios');

async function test() {
  try {
    const response = await axios.get('https://api.hh.ru/vacancies', {
      params: { text: 'frontend', area: 113, per_page: 1 },
      headers: {
        'User-Agent': 'WorkAnalytics/1.0 (test@mail.ru)'
      }
    });
    console.log("HH Response:", response.data.items.length);
  } catch (e) {
    console.error("HH Error:", e.response?.status, e.response?.data);
  }
}

test();
