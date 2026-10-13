function generateCaseNumber() {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `CAS-${year}-${randomNum}`;
}

function generatePatientRef() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const prefix = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const suffix = letters[Math.floor(Math.random() * letters.length)];
  return `PT-${num}-${suffix}`;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim();
}

module.exports = {
  generateCaseNumber,
  generatePatientRef,
  sanitizeString,
};
