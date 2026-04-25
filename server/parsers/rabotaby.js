/**
 * @file rabotaby.js — Парсер вакансий с Rabota.by.
 * @description Рефакторинг с использованием ООП. Наследует HhParser.
 */

const { HhParser } = require('./hh');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

const API_BASE = 'https://api.hh.ru';
const PAGE_DELAY_MS = 500;

class RabotaByParser extends HhParser {
  constructor() {
    super(16);
    this.name = 'Rabota.by';
  }

  normalizeVacancy(vacancy) {
    const job = super.normalizeVacancy(vacancy);
    job.source = 'rabotaby';
    
    // Корректировка города для Беларуси
    const workFormat = (vacancy.schedule?.id === 'remote') ? 'Remote' : 'Office';
    let city = vacancy.area?.name || 'Не указан';
    if (workFormat === 'Remote' || city === 'Не указан' || city === 'Беларусь') {
      city = 'Онлайн';
    }
    job.city = city;
    
    job.salary.currency = this.mapCurrency(vacancy.salary?.currency);
    return job;
  }

  mapCurrency(currency) {
    const map = {
      RUR: 'RUB', RUB: 'RUB', USD: 'USD', EUR: 'EUR',
      BYR: 'BYN', BYN: 'BYN', KZT: 'KZT', UAH: 'UAH',
    };
    return map[currency] || currency || 'BYN';
  }
}

const parser = new RabotaByParser();
module.exports = { parse: parser.parse.bind(parser), RabotaByParser };
