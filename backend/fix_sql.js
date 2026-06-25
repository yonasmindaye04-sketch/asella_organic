import fs from 'fs';
import path from 'path';

const sqlPath = path.join(process.cwd(), 'db', 'sql', '004_dummy_data.sql');
let content = fs.readFileSync(sqlPath, 'utf8');

// Replace full-width numbers with standard numbers
const fullWidth = '０１２３４５６７８９．';
const standard = '0123456789.';

for (let i = 0; i < fullWidth.length; i++) {
    content = content.split(fullWidth[i]).join(standard[i]);
}

// Replace subscript numbers with standard numbers
const subscript = '₀₁₂₃₄₅₆₇₈₉';
for (let i = 0; i < subscript.length; i++) {
    content = content.split(subscript[i]).join(standard[i]);
}

// Replace superscript numbers with standard numbers
const superscript = '⁰¹²³⁴⁵⁶⁷⁸⁹';
for (let i = 0; i < superscript.length; i++) {
    content = content.split(superscript[i]).join(standard[i]);
}

// Replace full width letters if any
content = content.replace(/[\uFF01-\uFF5E]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
});

fs.writeFileSync(sqlPath, content, 'utf8');
console.log('Fixed unicode characters in 004_dummy_data.sql');
