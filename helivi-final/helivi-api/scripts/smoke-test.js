#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

let ok = 0;
let fail = 0;

function pass(m) { ok += 1; console.log('  ✅', m); }
function bad(m, e) { fail += 1; console.error('  ❌', m, e ? String(e.message || e) : ''); }

function listJs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listJs(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

console.log('\n═══ helivi-api smoke ═══\n');
console.log('1. Sintaxe');
for (const f of listJs(SRC)) {
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
    pass(path.relative(ROOT, f));
  } catch (e) {
    bad(path.relative(ROOT, f), e);
  }
}

console.log('\n2. Carregar app (sem listen)');
try {
  require(path.join(SRC, 'index.js'));
  pass('src/index.js carrega');
} catch (e) {
  bad('carregar app', e);
}

console.log(`\n═══ Resultado: ${ok} ok, ${fail} falha(s) ═══\n`);
process.exit(fail > 0 ? 1 : 0);
