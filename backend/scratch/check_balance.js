const fs = require('fs');
const content = fs.readFileSync('frontend/dashboard/js/dashboard.js', 'utf8');

let braceDepth = 0;
let parenDepth = 0;
let inStr = false;
let strChar = '';
let inTemplateLiteral = 0;
let lineNum = 1;
let firstImbalanceLine = null;

for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '\n') lineNum++;

    if (!inStr && inTemplateLiteral === 0) {
        if (c === '"' || c === "'") { inStr = true; strChar = c; }
        else if (c === '`') { inTemplateLiteral++; }
        else if (c === '{') { braceDepth++; }
        else if (c === '}') {
            braceDepth--;
            if (braceDepth < 0 && !firstImbalanceLine) {
                firstImbalanceLine = lineNum;
                console.log(`Extra closing brace at line ${lineNum}`);
                braceDepth = 0;
            }
        }
        else if (c === '(') { parenDepth++; }
        else if (c === ')') {
            parenDepth--;
            if (parenDepth < 0 && !firstImbalanceLine) {
                firstImbalanceLine = lineNum;
                console.log(`Extra closing paren at line ${lineNum}`);
                parenDepth = 0;
            }
        }
    } else if (inStr) {
        if (c === '\\') { i++; } // skip escaped char
        else if (c === strChar) { inStr = false; }
    } else if (inTemplateLiteral > 0) {
        if (c === '`') { inTemplateLiteral--; }
    }
}

console.log(`Final brace depth: ${braceDepth}`);
console.log(`Final paren depth: ${parenDepth}`);
console.log(`Total lines: ${lineNum}`);
