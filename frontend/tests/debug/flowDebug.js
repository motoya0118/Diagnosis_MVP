// Simple debug helpers to visualize the decision trail

function formatTrail(path) {
  if (!Array.isArray(path)) return '';
  return path.map((s) => `${s.id}=${s.code}`).join(' > ');
}

function logTrail(key, path) {
  // eslint-disable-next-line no-console
  console.log(` - ${key}: ${formatTrail(path)}`);
}

module.exports = { formatTrail, logTrail };

