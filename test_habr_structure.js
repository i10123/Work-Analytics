const axios = require('axios');
const cheerio = require('cheerio');

async function testHabr() {
  const url = 'https://career.habr.com/vacancies?type=all';
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  
  const $ = cheerio.load(response.data);
  $('.vacancy-card').slice(0, 5).each((i, el) => {
    const $card = $(el);
    console.log(`--- Card ${i + 1} ---`);
    console.log('Title:', $card.find('.vacancy-card__title a').text().trim());
    
    // We can extract parts of meta
    const metas = [];
    $card.find('.vacancy-card__meta .inline-list').children().each((_, child) => {
       metas.push($(child).text().trim());
    });
    console.log('Metas:', metas.join(' | '));
    console.log('Meta Text RAW:', $card.find('.vacancy-card__meta').text().trim());
    
    console.log('Datetime attr:', $card.find('time.basic-date').attr('datetime'));
    console.log('Description:', $card.find('.vacancy-card__description').text().trim());
    console.log('Skills:', $card.find('.vacancy-card__skills').text().trim().replace(/\n/g, ' '));
  });
}

testHabr().catch(console.error);
