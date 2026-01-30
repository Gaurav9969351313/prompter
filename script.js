document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('orchestratorForm');
    const submitBtn = document.getElementById('submitBtn');
    const responseOutput = document.getElementById('responseOutput');
    const connectionStatus = document.getElementById('connectionStatus');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const originalBtnText = submitBtn.innerText;

    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBJFIJZKYBWSbwGw-CyrSBC4SpgUJnhgoawvs2cnZhjjW_VW6LA2vZXR3rJYufpO8PTA/exec';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // UI Loading State
        setLoading(true);
        responseOutput.innerHTML = '<div class="placeholder-text"><span class="spinner"></span> Generating response from Agent...</div>';

        // Capture data
        const agentOption = document.querySelector('input[name="agent"]:checked');
        if (!agentOption) {
            alert("Please select an agent.");
            setLoading(false);
            return;
        }
        const agent = agentOption.value;
        const context = document.getElementById('contextInput').value;
        const outputFormat = document.getElementById('outputFormat').value;

        // Build URL with query parameters
        const url = new URL(GOOGLE_SCRIPT_URL);
        url.searchParams.append('agentname', agent);
        url.searchParams.append('context', context);
        url.searchParams.append('outputFormat', outputFormat);

        try {
            // GET request with URL parameters
            const response = await fetch(url.toString(), {
                method: 'GET',
                mode: 'cors'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            // Check if the request was successful
            if (result.status === 'success') {
                // Success state
                connectionStatus.textContent = 'Completed';
                connectionStatus.className = 'status-indicator active';

                // Optionally log the extra context
                console.log('Agent:', agent);
                console.log('Context:', result.extraContext);
                console.log('Output Format:', result.outputFormat);

                // Handle different output formats
                if (result.outputFormat === 'HTML') {
                    // Inject HTML content directly into the response panel
                    responseOutput.innerHTML = result.output;
                } else if (result.outputFormat === 'PDF') {
                    // PDF was sent via email
                    responseOutput.innerHTML = `
                        <div class="success-message">
                            <h2>✅ PDF Report Sent!</h2>
                            <p><strong>Agent:</strong> ${agent}</p>
                            <p><strong>Context:</strong> ${result.extraContext}</p>
                            <p>The PDF report has been generated and sent to your email.</p>
                            <p class="note">Check your inbox for the attachment.</p>
                        </div>
                    `;
                } else if (result.outputFormat === 'EMAIL') {
                    // HTML email was sent
                    responseOutput.innerHTML = `
                        <div class="success-message">
                            <h2>✅ HTML Email Sent!</h2>
                            <p><strong>Agent:</strong> ${agent}</p>
                            <p><strong>Context:</strong> ${result.extraContext}</p>
                            <p>A beautifully formatted HTML email has been sent to your inbox.</p>
                            <p class="note">Check your email to view the full response.</p>
                        </div>
                    `;
                }

                form.reset();
            } else {
                throw new Error(result.message || 'Unknown error occurred');
            }

        } catch (error) {
            console.error('Submission Error:', error);
            responseOutput.innerHTML = `
                <div class="log-entry error">
                    <strong>Error:</strong> Failed to fetch response.<br>
                    ${error.message}<br><br>
                    <em>Note: Ensure your Apps Script Web App is deployed as "Anyone" and returns CORS headers.</em>
                </div>
            `;
            connectionStatus.textContent = 'Error';
        } finally {
            setLoading(false);
        }
    });

    // PDF Download Handler
    downloadPdfBtn.addEventListener('click', () => {
        const element = responseOutput;
        const opt = {
            margin: 10,
            filename: 'agent-response.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // Don't print placeholders/spinners if empty
        if (element.querySelector('.placeholder-text')) {
            alert("No content to download!");
            return;
        }

        html2pdf().set(opt).from(element).save();
    });

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.innerHTML = isLoading ?
            'Dispatching...' :
            originalBtnText;

        if (isLoading) {
            connectionStatus.textContent = 'Thinking...';
            connectionStatus.classList.remove('active');
        }
    }
});
