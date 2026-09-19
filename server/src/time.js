function parseClientTimestamp(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const match = text.match(/(Z|([+-])(\d{2}):(\d{2}))$/);
  if (!match) return null;
  const utc = new Date(text);
  if (Number.isNaN(utc.getTime())) return null;
  let offsetMin = 0;
  if (match[1] !== 'Z') {
    const sign = match[2] === '-' ? -1 : 1;
    offsetMin = sign * (Number(match[3]) * 60 + Number(match[4]));
  }
  return { utc, offsetMin };
}

module.exports = { parseClientTimestamp };
