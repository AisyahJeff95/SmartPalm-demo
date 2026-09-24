const fs = require('fs');
function checkSyntax(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    try {
        new Function(code);
        console.log(filePath + ': OK');
    } catch (e) {
        console.log(filePath + ': Error - ' + e.message);
    }
}
checkSyntax('js/comprehensive.js');
checkSyntax('js/reada.js');
