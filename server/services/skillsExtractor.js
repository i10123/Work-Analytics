/**
 * skillsExtractor.js
 * Суть: Извлечение ключевых IT-навыков из текста вакансии (название + описание).
 * Что делает: Использует набор оптимизированных регулярных выражений для детекции популярных технологий.
 * Служит надежным локальным fallback-решением, если AI отключен/недоступен, а также дополняет AI-анализ.
 */

const skillRules = [
  // Languages
  { pattern: /\bjavascript\b/i, name: 'JavaScript' },
  { pattern: /\btypescript\b/i, name: 'TypeScript' },
  { pattern: /\b(js|ts)\b/i, name: (m) => m[1].toLowerCase() === 'js' ? 'JavaScript' : 'TypeScript' },
  { pattern: /\bpython\b/i, name: 'Python' },
  { pattern: /\bjava\b/i, name: 'Java' },
  { pattern: /\b(go|golang)\b/i, name: 'Go' },
  { pattern: /\brust\b/i, name: 'Rust' },
  { pattern: /\bkotlin\b/i, name: 'Kotlin' },
  { pattern: /\bswift\b/i, name: 'Swift' },
  { pattern: /\bscala\b/i, name: 'Scala' },
  { pattern: /\bphp\b/i, name: 'PHP' },
  { pattern: /\bruby\b/i, name: 'Ruby' },
  { pattern: /\bc\+\+/i, name: 'C++' },
  { pattern: /\b(c#|\.net)\b/i, name: 'C# / .NET' },
  { pattern: /\bdart\b/i, name: 'Dart' },
  { pattern: /\b(1c|1с)\b/iu, name: '1C' },

  // Frontend Frameworks & Libraries
  { pattern: /\breact\b/i, name: 'React' },
  { pattern: /\bvue\b/i, name: 'Vue' },
  { pattern: /\bangular\b/i, name: 'Angular' },
  { pattern: /\bsvelte\b/i, name: 'Svelte' },
  { pattern: /\bnext\.?js\b/i, name: 'Next.js' },
  { pattern: /\bnuxt\.?js\b/i, name: 'Nuxt.js' },
  { pattern: /\bgatsby\b/i, name: 'Gatsby' },
  { pattern: /\bjquery\b/i, name: 'jQuery' },
  { pattern: /\bredux\b/i, name: 'Redux' },
  { pattern: /\bzustand\b/i, name: 'Zustand' },
  { pattern: /\bmobx\b/i, name: 'MobX' },
  { pattern: /\bpinia\b/i, name: 'Pinia' },
  { pattern: /\brxjs\b/i, name: 'RxJS' },
  { pattern: /\bbackbone\b/i, name: 'Backbone.js' },

  // Styling & UI Libraries
  { pattern: /\bhtml(5)?\b/i, name: 'HTML' },
  { pattern: /\bcss(3)?\b/i, name: 'CSS' },
  { pattern: /\b(sass|scss)\b/i, name: 'Sass / SCSS' },
  { pattern: /\bless\b/i, name: 'Less' },
  { pattern: /\b(tailwind|tailwindcss)\b/i, name: 'Tailwind CSS' },
  { pattern: /\bbootstrap\b/i, name: 'Bootstrap' },
  { pattern: /\b(material-ui|mui)\b/i, name: 'Material-UI' },
  { pattern: /\bantd\b/i, name: 'Ant Design' },
  { pattern: /\b(chakra-ui|chakra)\b/i, name: 'Chakra UI' },
  { pattern: /\bcss-in-js\b/i, name: 'CSS-in-JS' },
  { pattern: /\bstyled-components\b/i, name: 'Styled Components' },
  { pattern: /\b(flexbox|css\s*grid)\b/i, name: 'Flexbox / Grid' },

  // Build tools & Bundlers
  { pattern: /\bwebpack\b/i, name: 'Webpack' },
  { pattern: /\bvite\b/i, name: 'Vite' },
  { pattern: /\bgulp\b/i, name: 'Gulp' },
  { pattern: /\brollup\b/i, name: 'Rollup' },
  { pattern: /\bparcel\b/i, name: 'Parcel' },

  // Mobile development
  { pattern: /\b(react\s*native|rn)\b/i, name: 'React Native' },
  { pattern: /\bflutter\b/i, name: 'Flutter' },
  { pattern: /\b(ios|android)\b/i, name: (m) => m[1].toLowerCase() === 'ios' ? 'iOS' : 'Android' },
  { pattern: /\bswiftui\b/i, name: 'SwiftUI' },

  // Backend Frameworks & Runtimes
  { pattern: /\bnode\.?js\b/i, name: 'Node.js' },
  { pattern: /\bexpress\b/i, name: 'Express' },
  { pattern: /\bnest\.?js\b/i, name: 'NestJS' },
  { pattern: /\bkoa\b/i, name: 'Koa' },
  { pattern: /\bfastify\b/i, name: 'Fastify' },
  { pattern: /\bdjango\b/i, name: 'Django' },
  { pattern: /\bfastapi\b/i, name: 'FastAPI' },
  { pattern: /\bflask\b/i, name: 'Flask' },
  { pattern: /\bspring(\s*boot)?\b/i, name: 'Spring Boot' },
  { pattern: /\bhibernate\b/i, name: 'Hibernate' },
  { pattern: /\blaravel\b/i, name: 'Laravel' },
  { pattern: /\bsymfony\b/i, name: 'Symfony' },
  { pattern: /\basp\.net\b/i, name: 'ASP.NET' },
  { pattern: /\bgorilla\b/i, name: 'Gorilla' },
  { pattern: /\bfiber\b/i, name: 'Fiber' },

  // Databases & ORMs/ODMs
  { pattern: /\b(postgresql|postgres)\b/i, name: 'PostgreSQL' },
  { pattern: /\bmysql\b/i, name: 'MySQL' },
  { pattern: /\bsqlite\b/i, name: 'SQLite' },
  { pattern: /\bmongodb\b/i, name: 'MongoDB' },
  { pattern: /\bredis\b/i, name: 'Redis' },
  { pattern: /\belasticsearch\b/i, name: 'Elasticsearch' },
  { pattern: /\bclickhouse\b/i, name: 'ClickHouse' },
  { pattern: /\bmariadb\b/i, name: 'MariaDB' },
  { pattern: /\boracle\b/i, name: 'Oracle' },
  { pattern: /\bmssql\b/i, name: 'MSSQL' },
  { pattern: /\bsql\b/i, name: 'SQL' },
  { pattern: /\bnosql\b/i, name: 'NoSQL' },
  { pattern: /\bprisma\b/i, name: 'Prisma' },
  { pattern: /\btypeorm\b/i, name: 'TypeORM' },
  { pattern: /\bsequelize\b/i, name: 'Sequelize' },
  { pattern: /\bmongoose\b/i, name: 'Mongoose' },

  // Architecture & APIs
  { pattern: /\bgrpc\b/i, name: 'gRPC' },
  { pattern: /\brest(\s*api)?\b/i, name: 'REST API' },
  { pattern: /\bgraphql\b/i, name: 'GraphQL' },
  { pattern: /\bsoap\b/i, name: 'SOAP' },
  { pattern: /\bwebsocket(s)?\b/i, name: 'WebSockets' },
  { pattern: /\b(fsd|feature-sliced(\s*design)?)\b/i, name: 'FSD' },
  { pattern: /\bmicroservices\b/i, name: 'Микросервисы' },

  // Cloud & DevOps
  { pattern: /\bdocker\b/i, name: 'Docker' },
  { pattern: /\b(kubernetes|k8s)\b/i, name: 'Kubernetes' },
  { pattern: /\bansible\b/i, name: 'Ansible' },
  { pattern: /\bterraform\b/i, name: 'Terraform' },
  { pattern: /\bci[\/-]cd\b/i, name: 'CI/CD' },
  { pattern: /\bgithub\s*actions\b/i, name: 'GitHub Actions' },
  { pattern: /\bgitlab\s*ci\b/i, name: 'GitLab CI' },
  { pattern: /\bjenkins\b/i, name: 'Jenkins' },
  { pattern: /\baws\b/i, name: 'AWS' },
  { pattern: /\b(gcp|google\s*cloud)\b/i, name: 'GCP' },
  { pattern: /\bazure\b/i, name: 'Azure' },
  { pattern: /\bnginx\b/i, name: 'Nginx' },
  { pattern: /\bprometheus\b/i, name: 'Prometheus' },
  { pattern: /\bgrafana\b/i, name: 'Grafana' },
  { pattern: /\blinux\b/i, name: 'Linux' },
  { pattern: /\bbash\b/i, name: 'Bash' },

  // Message Brokers
  { pattern: /\brabbitmq\b/i, name: 'RabbitMQ' },
  { pattern: /\bkafka\b/i, name: 'Kafka' },
  { pattern: /\bactivemq\b/i, name: 'ActiveMQ' },
  { pattern: /\bnats\b/i, name: 'NATS' },

  // Testing Frameworks
  { pattern: /\bjest\b/i, name: 'Jest' },
  { pattern: /\bcypress\b/i, name: 'Cypress' },
  { pattern: /\bplaywright\b/i, name: 'Playwright' },
  { pattern: /\bselenium\b/i, name: 'Selenium' },
  { pattern: /\bmocha\b/i, name: 'Mocha' },
  { pattern: /\bchai\b/i, name: 'Chai' },
  { pattern: /\bvitest\b/i, name: 'Vitest' },

  // Tools & Methodologies
  { pattern: /\bgit\b/i, name: 'Git' },
  { pattern: /\bgithub\b/i, name: 'GitHub' },
  { pattern: /\bgitlab\b/i, name: 'GitLab' },
  { pattern: /\bjira\b/i, name: 'Jira' },
  { pattern: /\bconfluence\b/i, name: 'Confluence' },
  { pattern: /\bscrum\b/i, name: 'Scrum' },
  { pattern: /\bagile\b/i, name: 'Agile' },
  { pattern: /\bfigma\b/i, name: 'Figma' },
  { pattern: /\bsolid\b/i, name: 'SOLID' },
  { pattern: /\btdd\b/i, name: 'TDD' },
  { pattern: /\bddd\b/i, name: 'DDD' },
  { pattern: /\boop\b/i, name: 'OOP' }
];

/**
 * Извлекает список уникальных навыков из названия вакансии и ее описания.
 * @param {string} title Название вакансии
 * @param {string} description Описание или сниппет вакансии
 * @returns {string[]} Список распознанных навыков
 */
function extractLocalSkills(title, description) {
  const text = `${title || ''} ${description || ''}`;
  const skillsSet = new Set();

  for (const rule of skillRules) {
    const match = text.match(rule.pattern);
    if (match) {
      if (typeof rule.name === 'function') {
        skillsSet.add(rule.name(match));
      } else {
        skillsSet.add(rule.name);
      }
    }
  }

  return Array.from(skillsSet);
}

module.exports = {
  extractLocalSkills
};
