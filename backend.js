/* 
COMPLETED FEATURES:
✓ Uses GET request with URL parameters
✓ Added outputFormat parameter (PDF | HTML | EMAIL)
✓ PDF: Sends email with PDF attachment and cleans up temporary Google Doc
✓ HTML: Returns HTML content in JSON response for preview
✓ EMAIL: Sends styled HTML email with preserved formatting
✓ Includes extraContext in all responses

USAGE:
GET request to the deployed web app URL with query parameters:
https://script.google.com/.../exec?agentname=SA&context=manager%20is%20asking%20unrealistic%20timelines&outputFormat=HTML

Parameters:
- agentname: Agent code (EA, SA, CT, SM)
- context: Task description (URL encoded)
- outputFormat: PDF | HTML | EMAIL (optional, defaults to PDF)
*/

function doGet(e) {
    try {
        // Parse GET parameters
        const agentName = e.parameter.agentname;
        const extraContext = e.parameter.context || '';
        const outputFormat = (e.parameter.outputFormat || 'PDF').toUpperCase(); // PDF | HTML | EMAIL

        if (!agentName) {
            return ContentService
                .createTextOutput(JSON.stringify({ status: 'error', message: 'Missing agentname parameter' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Validate outputFormat
        if (!['PDF', 'EMAIL', 'HTML'].includes(outputFormat)) {
            return ContentService
                .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid outputFormat. Must be PDF, HTML, or EMAIL' }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const result = runAgent(agentName, extraContext, outputFormat);

        return ContentService
            .createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService
            .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * Run a single agent by name
 */
function runAgent(agentName, extraContext, outputFormat) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('GTAgents');
    const data = sheet.getDataRange().getValues();

    // Find the agent in the sheet
    let basePrompt = null;
    for (let i = 1; i < data.length; i++) { // skip header
        if (data[i][0].toString().trim().toLowerCase() === agentName.toLowerCase()) {
            basePrompt = data[i][1];
            break;
        }
    }

    if (!basePrompt) {
        throw new Error(`Agent "${agentName}" not found in sheet`);
    }

    // Combine base prompt + extra context
    const finalPrompt = basePrompt + '\n\n' + extraContext;

    return generateAndSendOutput(agentName, finalPrompt, outputFormat, extraContext);
}

/**
 * Generate output and send based on format
 */
function generateAndSendOutput(agentName, fullPrompt, outputFormat, extraContext) {
    const apiKey = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY in Script Properties');

    const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

    const payload = {
        model: 'xiaomi/mimo-v2-flash:free',
        messages: [
            { role: 'system', content: 'You are a brutally honest strategic advisor.' },
            { role: 'user', content: fullPrompt }
        ],
        temperature: 0.6
    };

    const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + apiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    };

    try {
        const response = UrlFetchApp.fetch(apiUrl, options);
        const result = JSON.parse(response.getContentText());
        const advisorText = result.choices[0].message.content;

        // Handle different output formats
        switch (outputFormat) {
            case 'PDF':
                return handlePDFOutput(agentName, advisorText, extraContext);

            case 'EMAIL':
                return handleEmailOutput(agentName, advisorText, extraContext);

            case 'HTML':
                return handleHTMLOutput(agentName, advisorText, extraContext);

            default:
                throw new Error('Invalid output format');
        }

    } catch (e) {
        Logger.log(`Error for ${agentName}: ${e.message}`);
        throw e;
    }
}

/**
 * Handle PDF output format
 */
function handlePDFOutput(agentName, advisorText, extraContext) {
    // Create styled Google Doc
    const doc = DocumentApp.create(`${agentName}-Output`);
    const body = doc.getBody();

    // Page margins
    body.setMarginTop(36)
        .setMarginBottom(36)
        .setMarginLeft(36)
        .setMarginRight(36);

    // Title
    body.insertParagraph(0, `${agentName} - ${extraContext}`)
        .setHeading(DocumentApp.ParagraphHeading.HEADING1)
        .setBold(true);
    body.appendParagraph(' ');

    body.appendParagraph(' ');

    // Render styled AI output
    addStyledContent(body, advisorText);

    doc.saveAndClose();

    // Convert to PDF
    const docFile = DriveApp.getFileById(doc.getId());
    const pdf = docFile
        .getAs('application/pdf')
        .setName(`${agentName}-Output.pdf`);

    // Send email
    MailApp.sendEmail({
        to: 'gauravtalele2025@gmail.com',
        subject: `${agentName} - Output`,
        body: `Attached is the strategic report for ${agentName}.`,
        attachments: [pdf]
    });

    // Clean up: Delete the Google Doc file after PDF conversion
    try {
        docFile.setTrashed(true);
        Logger.log(`Cleaned up temporary Google Doc: ${doc.getId()}`);
    } catch (e) {
        Logger.log(`Warning: Could not delete temporary doc: ${e.message}`);
    }

    Logger.log(`PDF report sent successfully for ${agentName}`);

    return {
        status: 'success',
        message: `PDF report sent for ${agentName}`,
        outputFormat: 'PDF',
        extraContext: extraContext
    };
}

function handleHTMLOutput(agentName, advisorText, extraContext) {
    const htmlContent = convertMarkdownToHTML(advisorText, agentName, extraContext);

    Logger.log(`HTML successfully generated for ${agentName}`);

    return {
        status: 'success',
        message: `HTML successfully generated for ${agentName}`,
        outputFormat: 'HTML',
        output: htmlContent.replaceAll("\n", ""),
        extraContext: extraContext
    };
}

/**
 * Handle Email output format (HTML styled email)
 */
function handleEmailOutput(agentName, advisorText, extraContext) {
    const htmlContent = convertMarkdownToHTML(advisorText, agentName, extraContext);

    // Send styled HTML email
    MailApp.sendEmail({
        to: 'gauravtalele2025@gmail.com',
        subject: `${agentName} - Output`,
        htmlBody: htmlContent
    });

    Logger.log(`HTML email sent successfully for ${agentName}`);

    return {
        status: 'success',
        message: `HTML email sent for ${agentName}`,
        outputFormat: 'EMAIL',
        extraContext: extraContext
    };
}

/**
 * Convert markdown-style text to styled HTML
 */
function convertMarkdownToHTML(text, agentName, extraContext) {
    const lines = text.split('\n');
    let html = `
<div class="agent-response">
    <h1>${agentName} - ${extraContext}</h1>
`;

    let inList = false;
    let listType = '';

    lines.forEach(line => {
        line = line.trim();
        if (!line) {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
            }
            return;
        }

        // Headings (lines ending with :)
        if (line.endsWith(':')) {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
            }
            html += `<h2>${escapeHtml(line)}</h2>\n`;
        }
        // Numbered lists
        else if (/^\d+\./.test(line)) {
            if (!inList || listType !== 'ol') {
                if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
                html += '<ol>\n';
                inList = true;
                listType = 'ol';
            }
            html += `<li>${escapeHtml(line.replace(/^\d+\.\s*/, ''))}</li>\n`;
        }
        // Bullet lists
        else if (line.startsWith('-')) {
            if (!inList || listType !== 'ul') {
                if (inList) html += listType === 'ol' ? '</ol>' : '</ul>';
                html += '<ul>\n';
                inList = true;
                listType = 'ul';
            }
            html += `<li>${escapeHtml(line.substring(1).trim())}</li>\n`;
        }
        // Regular paragraphs
        else {
            if (inList) {
                html += listType === 'ol' ? '</ol>' : '</ul>';
                inList = false;
            }
            html += `<p>${escapeHtml(line)}</p>\n`;
        }
    });

    if (inList) {
        html += listType === 'ol' ? '</ol>' : '</ul>';
    }

    html += `
    <div class="footer">
        <p>Generated by Strategic Advisor System</p>
        <p>${new Date().toLocaleString()}</p>
    </div>
</div>
`;

    return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Styled content parser
 */
function addStyledContent(body, text) {
    const lines = text.split('\n');

    lines.forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.endsWith(':')) {
            body.appendParagraph(line)
                .setHeading(DocumentApp.ParagraphHeading.HEADING2)
                .setBold(true)
                .setSpacingBefore(16)
                .setSpacingAfter(6);
        } else if (/^\d+\./.test(line)) {
            body.appendListItem(line)
                .setGlyphType(DocumentApp.GlyphType.NUMBER)
                .setFontSize(11);
        } else if (line.startsWith('-')) {
            body.appendListItem(line.substring(1).trim())
                .setGlyphType(DocumentApp.GlyphType.BULLET)
                .setFontSize(11);
        } else {
            body.appendParagraph(line)
                .setFontSize(11)
                .setLineSpacing(1.4)
                .setSpacingAfter(8);
        }
    });
}

