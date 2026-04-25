const axios = require('axios');

const UA = 'JobMarketAnalyzer/1.0 (deniskarakulko90@gmail.com)';

async function test() {
  console.log('=== Тест 1: Анонимный эндпоинт (справочники) ===');
  try {
    const res1 = await axios.get('https://api.hh.ru/areas/113', {
      headers: { 'User-Agent': UA, 'HH-User-Agent': UA, 'Accept': 'application/json' }
    });
    console.log('✅ Справочник регионов работает! Регион:', res1.data.name);
  } catch (e) {
    console.error('❌ Справочник:', e.response?.status, e.response?.data);
  }

  console.log('\n=== Тест 2: Поиск вакансий БЕЗ токена ===');
  try {
    const res2 = await axios.get('https://api.hh.ru/vacancies', {
      params: { text: 'frontend', area: 113, per_page: 1 },
      headers: { 'User-Agent': UA, 'HH-User-Agent': UA, 'Accept': 'application/json' }
    });
    console.log('✅ Вакансии без токена работают! Найдено:', res2.data.items.length);
  } catch (e) {
    console.error('❌ Вакансии без токена:', e.response?.status, e.response?.data);
  }

  console.log('\n=== Тест 3: Получение client_credentials токена ===');
  console.log('(Для этого нужно зарегистрировать приложение на dev.hh.ru)');
  console.log('Если у вас есть CLIENT_ID и CLIENT_SECRET в .env:');
  
  const clientId = process.env.HH_CLIENT_ID;
  const clientSecret = process.env.HH_CLIENT_SECRET;
  
  if (clientId && clientSecret) {
    try {
      const tokenRes = await axios.post('https://api.hh.ru/token', 
        `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
        {
          headers: {
            'User-Agent': UA,
            'HH-User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      const token = tokenRes.data.access_token;
      console.log('✅ Токен получен!');

      console.log('\n=== Тест 4: Поиск вакансий С токеном ===');
      const res4 = await axios.get('https://api.hh.ru/vacancies', {
        params: { text: 'frontend', area: 113, per_page: 1 },
        headers: {
          'User-Agent': UA,
          'HH-User-Agent': UA,
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('✅ Вакансии С токеном работают! Найдено:', res4.data.items.length);
    } catch (e) {
      console.error('❌ Токен/Вакансии с токеном:', e.response?.status, e.response?.data);
    }
  } else {
    console.log('⚠️  HH_CLIENT_ID и HH_CLIENT_SECRET не найдены в .env');
    console.log('   Зарегистрируйте приложение на https://dev.hh.ru и добавьте в .env:');
    console.log('   HH_CLIENT_ID=ваш_client_id');
    console.log('   HH_CLIENT_SECRET=ваш_client_secret');
  }
}

test();
