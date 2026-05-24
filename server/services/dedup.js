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

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const JACCARD_THRESHOLD_TITLE = 0.7;
const JACCARD_THRESHOLD_TITLE_HIGH = 0.85;
const JACCARD_THRESHOLD_COMPANY = 0.7;


function areFuzzyDuplicates(a, b) {
  const companyA = a._norm.company;
  const companyB = b._norm.company;

  
  if (a._norm.titleKey === b._norm.titleKey && companyA === companyB) {
    return true;
  }

  const titleSimilarity = jaccardSimilarity(a._norm.titleSet, b._norm.titleSet);

  
  if (titleSimilarity >= JACCARD_THRESHOLD_TITLE && companyA === companyB) {
    return true;
  }

  
  if (titleSimilarity >= JACCARD_THRESHOLD_TITLE_HIGH) {
    const companySimilarity = jaccardSimilarity(a._norm.companySet, b._norm.companySet);
    if (companySimilarity >= JACCARD_THRESHOLD_COMPANY) {
      return true;
    }
  }

  return false;
}


function mergeJobs(primary, duplicate) {
  
  if (duplicate.salary) {
    const pSal = primary.salary;
    const dSal = duplicate.salary;

    if (!pSal || (!pSal.min && !pSal.max && !pSal.currency)) {
      if (dSal.min || dSal.max) primary.salary = { ...dSal };
    } else {
      const pHasBoth = pSal.min && pSal.max;
      const dHasBoth = dSal.min && dSal.max;
      
      if (!pHasBoth && dHasBoth) {
        primary.salary = { ...dSal };
      } else if (!pHasBoth && !dHasBoth) {
        if (!pSal.min && dSal.min) pSal.min = dSal.min;
        if (!pSal.max && dSal.max) pSal.max = dSal.max;
      }
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

  
  const isSelf = primary.source === duplicate.source && primary.sourceId === duplicate.sourceId;
  
  if (!isSelf) {
    if (!primary.mergedFrom) primary.mergedFrom = [];
    const alreadyMerged = primary.mergedFrom.some(m => m.source === duplicate.source && m.sourceId === duplicate.sourceId);
    
    if (!alreadyMerged) {
      primary.mergedFrom.push({
        source: duplicate.source,
        sourceId: duplicate.sourceId,
        url: duplicate.url,
      });
    }
  }
}

function precomputeNorms(jobs) {
  for (const job of jobs) {
    const titleTokens = normalizeTitle(job.title);
    const company = normalizeCompany(job.company);
    const companyTokens = tokenize(company);
    job._norm = {
      titleTokens,
      titleKey: titleTokens.join(' '),
      titleSet: new Set(titleTokens),
      company,
      companySet: new Set(companyTokens),
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

  
  const idMap = new Map(); 
  
  for (let i = 0; i < jobs.length; i++) {
    if (isDuplicate.has(i)) continue;
    const job = jobs[i];
    if (!job.sourceId) continue;

    const idStr = String(job.sourceId);
    if (!idMap.has(idStr)) {
      idMap.set(idStr, [i]);
    } else {
      const existingIndices = idMap.get(idStr);
      let merged = false;

      for (const idx of existingIndices) {
        const existingJob = jobs[idx];
        
        
        const isSameSource = existingJob.source === job.source;
        
        
        const isHhRabotaCross = (existingJob.source === 'hh' && job.source === 'rabotaby') ||
                                (existingJob.source === 'rabotaby' && job.source === 'hh');

        
        if (isSameSource || isHhRabotaCross) {
          mergeJobs(existingJob, job);
          isDuplicate.add(i);
          mergedPairs.push({
            primary: {
              source: existingJob.source,
              sourceId: existingJob.sourceId,
              title: existingJob.title,
              company: existingJob.company,
              url: existingJob.url
            },
            duplicate: {
              source: job.source,
              sourceId: job.sourceId,
              title: job.title,
              company: job.company,
              url: job.url
            },
            reason: isSameSource ? 'sourceId_exact' : 'sourceId_cross',
          });
          merged = true;
          break;
        }
      }

      if (!merged) {
        existingIndices.push(i); 
      }
    }
  }

  
  
  for (let i = 0; i < jobs.length; i++) {
    if (isDuplicate.has(i)) continue;
    
    for (let j = i + 1; j < jobs.length; j++) {
      if (isDuplicate.has(j)) continue;

      if (areFuzzyDuplicates(jobs[i], jobs[j])) {
        mergeJobs(jobs[i], jobs[j]);
        isDuplicate.add(j);
        mergedPairs.push({
          primary: {
            source: jobs[i].source,
            sourceId: jobs[i].sourceId,
            title: jobs[i].title,
            company: jobs[i].company,
            url: jobs[i].url
          },
          duplicate: {
            source: jobs[j].source,
            sourceId: jobs[j].sourceId,
            title: jobs[j].title,
            company: jobs[j].company,
            url: jobs[j].url
          },
          reason: 'fuzzy',
        });
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
};
