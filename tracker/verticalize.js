const path = require('path');
const fs = require('fs');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'verticals.json'), 'utf8'));

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function classify(query) {
  const q = normalize(query);
  for (const v of CONFIG.verticals) {
    for (const m of v.matchers) {
      if (q.includes(normalize(m))) {
        return v.id;
      }
    }
  }
  return 'other';
}

function groupKeywords(keywords) {
  const groups = {};
  for (const v of CONFIG.verticals) {
    groups[v.id] = { id: v.id, label: v.label, description: v.description, keywords: [] };
  }
  groups.other = { id: 'other', label: CONFIG.otherLabel || 'Autres', description: '', keywords: [] };

  for (const kw of keywords) {
    const id = classify(kw.query);
    groups[id].keywords.push(kw);
  }

  for (const id of Object.keys(groups)) {
    groups[id].keywords.sort((a, b) => a.position - b.position);
    groups[id].total = groups[id].keywords.length;
    groups[id].top3 = groups[id].keywords.filter(k => k.position <= 3).length;
    groups[id].top10 = groups[id].keywords.filter(k => k.position <= 10).length;
    groups[id].top20 = groups[id].keywords.filter(k => k.position <= 20).length;
  }

  return groups;
}

module.exports = { classify, groupKeywords, CONFIG };
