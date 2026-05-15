const CYRILLIC_TO_LATIN = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
  'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
  'э': 'e', 'ю': 'yu', 'я': 'ya',
};

function transliterate(str) {
  if (!str) return '';
  let result = '';
  for (const char of str.toLowerCase()) {
    result += CYRILLIC_TO_LATIN[char] !== undefined ? CYRILLIC_TO_LATIN[char] : char;
  }
  return result;
}

const STOP_WORDS_LEVEL = new Set([
  'senior', 'junior', 'middle', 'lead', 'principal', 'staff', 'chief',
  'intern', 'trainee',
  'stazhyor', 'stazher',
  'mladshiy',
  'starshiy',
  'vedushchiy',
  'glavnyy',
]);
const STOP_WORDS_ROLE = new Set([
  'developer', 'engineer', 'programmer', 'specialist', 'architect',
  'analyst', 'consultant', 'manager', 'administrator', 'devops',
  'razrabotchik',
  'programmist',
  'inzhener',
  'spetsialist',
  'arkhitektor',
  'analitik',
  'konsultant',
  'menedzher',
  'administrator',
]);

const ALL_STOP_WORDS = new Set([...STOP_WORDS_LEVEL, ...STOP_WORDS_ROLE]);

function normalizeText(str) {
  if (!str) return '';
  let result = str.toLowerCase();
  result = transliterate(result);
  result = result.replace(/[^a-z0-9\s]/g, ' ');
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

function tokenize(normalizedStr) {
  if (!normalizedStr) return [];
  return normalizedStr.split(' ').filter(t => t.length > 0).sort();
}

function normalizeTitle(str) {
  const normalized = normalizeText(str);
  const tokens = normalized.split(' ').filter(t => t.length > 0);
  const filtered = tokens.filter(t => !ALL_STOP_WORDS.has(t));
  const result = filtered.length > 0 ? filtered : tokens;
  return result.sort();
}

function normalizeCompany(str) {
  return normalizeText(str);
}

function jaccardSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 && tokensB.length === 0) return 1.0;
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD_TITLE = 0.7;
const JACCARD_THRESHOLD_TITLE_HIGH = 0.85;
const JACCARD_THRESHOLD_COMPANY = 0.7;

function areDuplicates(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId && a.source !== b.source) {
    return true;
  }

  const titleTokensA = a._norm.titleTokens;
  const titleTokensB = b._norm.titleTokens;
  const companyA = a._norm.company;
  const companyB = b._norm.company;

  if (a._norm.titleKey === b._norm.titleKey && companyA === companyB) {
    return true;
  }

  const titleSimilarity = jaccardSimilarity(titleTokensA, titleTokensB);

  if (titleSimilarity >= JACCARD_THRESHOLD_TITLE && companyA === companyB) {
    return true;
  }

  if (titleSimilarity >= JACCARD_THRESHOLD_TITLE_HIGH) {
    const companyTokensA = tokenize(companyA);
    const companyTokensB = tokenize(companyB);
    const companySimilarity = jaccardSimilarity(companyTokensA, companyTokensB);
    if (companySimilarity >= JACCARD_THRESHOLD_COMPANY) {
      return true;
    }
  }

  return false;
}

function mergeJobs(primary, duplicate) {
  if (primary.salary && duplicate.salary) {
    if (!primary.salary.min && duplicate.salary.min) {
      primary.salary.min = duplicate.salary.min;
    }
    if (!primary.salary.max && duplicate.salary.max) {
      primary.salary.max = duplicate.salary.max;
    }
    if (!primary.salary.min && !primary.salary.max && (duplicate.salary.min || duplicate.salary.max)) {
      primary.salary = { ...duplicate.salary };
    }
  }
  if (duplicate.skills && duplicate.skills.length > 0) {
    const existingLower = new Set((primary.skills || []).map(s => s.toLowerCase()));
    for (const skill of duplicate.skills) {
      if (!existingLower.has(skill.toLowerCase())) {
        primary.skills.push(skill);
        existingLower.add(skill.toLowerCase());
      }
    }
  }
  if (duplicate.description && (!primary.description || duplicate.description.length > primary.description.length)) {
    primary.description = duplicate.description;
  }
  if ((!primary.experience || primary.experience === 'Не указан') && duplicate.experience && duplicate.experience !== 'Не указан') {
    primary.experience = duplicate.experience;
  }
  if ((!primary.employment || primary.employment === 'Не указан') && duplicate.employment && duplicate.employment !== 'Не указан') {
    primary.employment = duplicate.employment;
  }
  if (!primary.mergedFrom) {
    primary.mergedFrom = [];
  }
  primary.mergedFrom.push({
    source: duplicate.source,
    sourceId: duplicate.sourceId,
    url: duplicate.url,
  });
}

function getBlockingKey(titleTokens) {
  if (titleTokens.length === 0) return '__empty__';
  return titleTokens.slice(0, 2).join('_');
}

function precomputeNorms(jobs) {
  for (const job of jobs) {
    const titleTokens = normalizeTitle(job.title);
    job._norm = {
      titleTokens,
      titleKey: titleTokens.join(' '),
      company: normalizeCompany(job.company),
      blockingKey: getBlockingKey(titleTokens),
    };
  }
}

function cleanupNorms(jobs) {
  for (const job of jobs) {
    delete job._norm;
  }
}

function deduplicateJobs(jobs) {
  if (!jobs || jobs.length === 0) {
    return { uniqueJobs: [], stats: { totalBefore: 0, totalAfter: 0, duplicatesRemoved: 0, mergedPairs: [] } };
  }

  const totalBefore = jobs.length;
  const mergedPairs = [];

  precomputeNorms(jobs);

  const isDuplicate = new Set();
  const sourceIdMap = new Map();
  for (let i = 0; i < jobs.length; i++) {
    if (isDuplicate.has(i)) continue;
    const job = jobs[i];
    if (!job.sourceId) continue;

    const key = String(job.sourceId);
    if (sourceIdMap.has(key)) {
      const primaryIdx = sourceIdMap.get(key);
      if (jobs[primaryIdx].source !== job.source) {
        mergeJobs(jobs[primaryIdx], job);
        isDuplicate.add(i);
        mergedPairs.push({
          primary: `${jobs[primaryIdx].source}:${jobs[primaryIdx].sourceId}`,
          duplicate: `${job.source}:${job.sourceId}`,
          reason: 'sourceId',
        });
      }
    } else {
      sourceIdMap.set(key, i);
    }
  }

  const blocks = new Map();
  for (let i = 0; i < jobs.length; i++) {
    if (isDuplicate.has(i)) continue;
    const key = jobs[i]._norm.blockingKey;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(i);
  }

  for (const [, indices] of blocks) {
    if (indices.length < 2) continue;

    for (let i = 0; i < indices.length; i++) {
      const idxA = indices[i];
      if (isDuplicate.has(idxA)) continue;

      for (let j = i + 1; j < indices.length; j++) {
        const idxB = indices[j];
        if (isDuplicate.has(idxB)) continue;

        if (areDuplicates(jobs[idxA], jobs[idxB])) {
          mergeJobs(jobs[idxA], jobs[idxB]);
          isDuplicate.add(idxB);
          mergedPairs.push({
            primary: `${jobs[idxA].source}:${jobs[idxA].title}`,
            duplicate: `${jobs[idxB].source}:${jobs[idxB].title}`,
            reason: 'fuzzy',
          });
        }
      }
    }
  }

  const uniqueJobs = jobs.filter((_, i) => !isDuplicate.has(i));
  cleanupNorms(uniqueJobs);

  const stats = {
    totalBefore,
    totalAfter: uniqueJobs.length,
    duplicatesRemoved: totalBefore - uniqueJobs.length,
    mergedPairs,
  };

  return { uniqueJobs, stats };
}

module.exports = {
  deduplicateJobs,
  transliterate,
  normalizeText,
  normalizeTitle,
  normalizeCompany,
  jaccardSimilarity,
  areDuplicates,
  mergeJobs,
};
