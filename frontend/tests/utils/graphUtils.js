function reachableNodes(flow, start) {
  const seen = new Set();
  const q = [start];
  while (q.length) {
    const id = q.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = flow[id];
    if (!node || !Array.isArray(node.options)) continue;
    for (const opt of node.options) {
      if (opt.next && !seen.has(opt.next)) q.push(opt.next);
    }
  }
  return seen;
}

function findDeadEnds(flow, start, maxDepth = 12) {
  const reachable = reachableNodes(flow, start);
  const cache = new Map();

  function canReachResult(id, depth, visiting) {
    if (depth > maxDepth) return false;
    if (cache.has(id)) return cache.get(id);
    const node = flow[id];
    if (!node || !Array.isArray(node.options)) {
      cache.set(id, false);
      return false;
    }
    for (const opt of node.options) {
      if (opt.result) {
        cache.set(id, true);
        return true;
      }
    }
    visiting = visiting || new Set();
    visiting.add(id);
    for (const opt of node.options) {
      if (opt.next) {
        if (visiting.has(opt.next)) continue;
        if (!flow[opt.next]) continue;
        if (canReachResult(opt.next, depth + 1, new Set(visiting))) {
          cache.set(id, true);
          return true;
        }
      }
    }
    cache.set(id, false);
    return false;
  }

  const dead = [];
  for (const id of reachable) {
    const node = flow[id];
    if (!node) continue;
    const invalidLinks = (node.options || []).filter((o) => !o.result && !o.next);
    if (invalidLinks.length) {
      dead.push({ id, reason: `option(s) without next/result: ${invalidLinks.map((o) => o.code).join(',')}` });
      continue;
    }
    const broken = (node.options || []).filter((o) => o.next && !flow[o.next]);
    if (broken.length) {
      dead.push({ id, reason: `broken next reference(s): ${broken.map((o) => `${o.code}->${o.next}`).join(', ')}` });
      continue;
    }
    if (!canReachResult(id, 0)) {
      dead.push({ id, reason: 'no path to any result' });
    }
  }
  return dead;
}

function findPathToResult(flow, startId, targetResult, maxDepth = 12) {
  const stack = [{ id: startId, path: [] }];
  while (stack.length) {
    const { id, path } = stack.pop();
    if (path.length > maxDepth) continue;
    const node = flow[id];
    if (!node) continue;
    for (const opt of node.options || []) {
      const newPath = path.concat({ id, code: opt.code });
      if (opt.result) {
        if (opt.result === targetResult) return newPath;
        continue;
      }
      if (opt.next) {
        const nextId = opt.next;
        if (newPath.some((p) => p.id === nextId)) continue;
        stack.push({ id: nextId, path: newPath });
      }
    }
  }
  return null;
}

module.exports = { reachableNodes, findDeadEnds, findPathToResult };

