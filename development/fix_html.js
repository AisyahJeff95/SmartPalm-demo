const fs = require('fs');

function fixHtml(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');
    
    // Fix the group box title
    content = content.replace('<div class="group-box-title">Fertilizer Ratio</div>', '<div class="group-box-title">Fertilizer Used / To Use</div>');
    
    // Fix the column header
    // The previous text was: <div style="flex: 1; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">To Use</div>
    content = content.replace('font-weight: 600;">To Use</div>', 'font-weight: 600;">Ratio</div>');
    
    fs.writeFileSync(filepath, content);
    console.log(`Updated ${filepath}`);
}

fixHtml('comprehensive.html');
fixHtml('standard.html');
