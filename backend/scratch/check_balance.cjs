const fs = require('fs');
const content = fs.readFileSync('C:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/dashboard/js/dashboard.js', 'utf8');

let i = 0;
let braceDepth = 0;
let lineNum = 1;
const len = content.length;
const lines = content.split('\n');
// Store depth AT START of each line (before processing it)
const depthBeforeLine = new Array(lines.length + 2).fill(0);

function peek() { return i < len ? content[i] : null; }
function next() { 
    const c = content[i++]; 
    if (c === '\n') { 
        lineNum++;
        if (lineNum <= depthBeforeLine.length) depthBeforeLine[lineNum] = braceDepth;
    }
    return c; 
}

depthBeforeLine[1] = 0;

while (i < len) {
    const c = peek();
    if (c === '/' && content[i+1] === '/') {
        while (i < len && peek() !== '\n') next();
        continue;
    }
    if (c === '/' && content[i+1] === '*') {
        next(); next();
        while (i < len) {
            if (peek() === '*' && content[i+1] === '/') { next(); next(); break; }
            next();
        }
        continue;
    }
    if (c === '"' || c === "'") {
        const quote = next();
        while (i < len) {
            const sc = next();
            if (sc === '\\') { next(); continue; }
            if (sc === quote) break;
        }
        continue;
    }
    if (c === '`') {
        next();
        while (i < len) {
            const tc = peek();
            if (tc === '\\') { next(); next(); continue; }
            if (tc === '`') { next(); break; }
            if (tc === '$' && content[i+1] === '{') {
                next(); next();
                braceDepth++;
                let exprDepth = 1;
                while (i < len && exprDepth > 0) {
                    const ec = peek();
                    if (ec === '/' && content[i+1] === '/') { while (i < len && peek() !== '\n') next(); continue; }
                    if (ec === '"' || ec === "'") {
                        const q2 = next();
                        while (i < len) { const s = next(); if (s === '\\') next(); else if (s === q2) break; }
                        continue;
                    }
                    if (ec === '`') {
                        next();
                        while (i < len) { const nc = next(); if (nc === '\\') next(); else if (nc === '`') break; }
                        continue;
                    }
                    next();
                    if (ec === '{') { exprDepth++; braceDepth++; }
                    else if (ec === '}') { exprDepth--; braceDepth--; }
                }
                continue;
            }
            next();
        }
        continue;
    }
    next();
    if (c === '{') braceDepth++;
    else if (c === '}') braceDepth--;
}

console.log(`Final brace depth: ${braceDepth}`);

// Find the last line where depth == 1 permanently (before the IIFE closes)
// The init() call is inside the IIFE body, so depth should be 2 when inside a function
// But at depth 1, we're in the "outer IIFE" body between top-level function declarations
// Find all lines where depth goes from 2→1 (closing a function)
const drops = [];
for (let ln = 2; ln <= lines.length; ln++) {
    if (depthBeforeLine[ln-1] === 2 && depthBeforeLine[ln] === 1) {
        drops.push(ln);
    }
}
console.log(`Total depth 2→1 drops: ${drops.length}`);
console.log('Last 5 drops:', drops.slice(-5));

// Show context around each of last 5 drops
drops.slice(-5).forEach(ln => {
    const s = Math.max(1, ln - 3);
    const e = Math.min(lines.length, ln + 5);
    console.log(`\n--- Around line ${ln} (depth drop 2→1) ---`);
    for (let j = s; j <= e; j++) {
        console.log(`  L${j} (d=${depthBeforeLine[j]}): ${lines[j-1].trim().substring(0, 90)}`);
    }
});
