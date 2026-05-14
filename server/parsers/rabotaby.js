const { HhParser } = require('./hh');

class RabotaByParser extends HhParser {
  constructor() {
    super(16); // area = 16 (Беларусь)
    this.name = 'Rabota.by';
  }

  normalizeVacancy(vacancy) {
    const job = super.normalizeVacancy(vacancy);
    job.source = 'rabotaby';
    const workFormat = (vacancy.schedule?.id === 'remote') ? 'Remote' : 'Office';
    let city = vacancy.area?.name || 'Не указан';
    if (workFormat === 'Remote' || city === 'Не указан' || city === 'Беларусь') {
      city = 'Онлайн';
    }
    job.city = city;

    job.salary.currency = this.mapCurrency(vacancy.salary?.currency, 'BYN');
    return job;
  }

}

const parser = new RabotaByParser();
module.exports = { parse: parser.parse.bind(parser), RabotaByParser };
