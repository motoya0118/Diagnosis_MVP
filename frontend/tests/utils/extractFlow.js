const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Reads and extracts `results` and `flow` object literals from Diagnostic.tsx
function getFlowAndResults() {
  const file = path.join(__dirname, '..', '..', 'components', 'domain', 'diagnostics', 'Diagnostic.tsx');
  const source = fs.readFileSync(file, 'utf8');

  const resultsMatch = source.match(/const\s+results\s*=\s*\{[\s\S]*?\n\};/);
  const flowMatch = source.match(/const\s+flow\s*=\s*\{[\s\S]*?\n\};/);
  if (!resultsMatch || !flowMatch) {
    throw new Error('Could not find const results or const flow in frontend/components/domain/diagnostics/Diagnostic.tsx');
  }
  const resultsCode = resultsMatch[0].replace(/^const\s+results\s*=\s*/, '');
  const flowCode = flowMatch[0].replace(/^const\s+flow\s*=\s*/, '');

  const code = `
    const results = ${resultsCode}
    const flow = ${flowCode}
    module.exports = { results, flow };
  `;
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { timeout: 1000, filename: 'flow-eval.js' });
  return sandbox.module.exports;
}

module.exports = { getFlowAndResults };
