import CONFIG from '../config/config.js';

function showError(message) {
    const dialog = document.getElementById('dialog');
    const dialogMessage = document.getElementById('dialogMessage');
    dialogMessage.textContent = message;
    dialog.style.display = 'block';
}

document.getElementById('closeDialog').addEventListener('click', () => {
    document.getElementById('dialog').style.display = 'none';
});

document.getElementById('replyButton').addEventListener('click', async () => {
    const loadingElement = document.getElementById('loading');
    const replyButton = document.getElementById('replyButton');
    
    loadingElement.style.display = 'flex';
    replyButton.disabled = true;
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const result = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: generateAndInsertReply,
            args: [CONFIG.OPENAI_API_KEY]
        });

        if (result[0].result && result[0].result.error) {
            showError(result[0].result.error);
        }
    } catch (error) {
        showError('Error: ' + error.message);
    } finally {
        loadingElement.style.display = 'none';
        replyButton.disabled = false;
    }
});

async function generateAndInsertReply(apiKey) {
    try {
        const emailContainers = document.querySelectorAll('.gs');
        if (emailContainers.length === 0) {
            return { error: 'No email content found. Please make sure you have an email open.' };
        }

        let emailContent = '';
        let senderName = '';
        emailContainers.forEach((container) => {
            const fromField = container.querySelector('.gD');
            if (fromField) {
                senderName = fromField.getAttribute('name') || '';
            }
            emailContent += container.innerText + '\n';
        });

        if (!emailContent.trim()) {
            return { error: 'Email content appears to be empty.' };
        }

        // Find and click reply button
        const replyButtons = document.querySelectorAll('[role="button"]');
        let replyButton;
        for (const button of replyButtons) {
            if (button.getAttribute('aria-label')?.toLowerCase().includes('reply')) {
                replyButton = button;
                break;
            }
        }

        if (!replyButton) {
            return { error: 'Reply button not found.' };
        }

        replyButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));

        const messageBody = document.querySelector('[role="textbox"]');
        if (!messageBody) {
            return { error: 'Could not find reply textbox.' };
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4-turbo-preview",
                messages: [{
                    role: "system",
                    content: `You are a professional measurement instruments sales assistant. When replying to emails:

              1. Begin with a brief greeting using the sender's name - if the sender is male add "sir after name else add madam"
              2. Start with "We are pleased to quote the following:"
              3. For each product mentioned, format as:
              
              Product Code: [code]
              Product Name: [name]
              Make: [manufacturer]
              Measurement Range: [range]
              Price:
              Delivery Time: 
              If you dont know any of those just skip it except price and delivery time -have those regardless and ENUMERATE all the products 

              4. If multiple products, list each one in the same format with a blank line between them
              5. End with a simple "Looking forward to your response."
              
              Keep the tone professional but concise. Focus only on the product details. No unnecessary text or pleasantries.
              
              Do not include:
              - Long introductions
              - Marketing language
              - Regards/signature blocks
              - Any price or delivery estimates
              
              Always leave price and delivery time with blank lines for manual filling.`
                }, {
                    role: "user",
                    content: `Generate a professional reply. Recipient: ${senderName}. Email content: ${emailContent}`
                }],
                temperature: 0.7,
                max_tokens: 800
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { error: `API Error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;
        
        // Format the reply with proper spacing and line breaks
        const formattedReply = reply
            .replace(/\n\n/g, '<br><br>')  // Double line breaks
            .replace(/\n/g, '<br>')         // Single line breaks
            .replace(/Product Code:/g, '<br><br>Product Code:')  // Extra space before each product
            .replace(/Looking forward/g, '<br><br>Looking forward'); // Extra space before closing
        
        messageBody.innerHTML = formattedReply;

    } catch (error) {
        return { error: 'Error: ' + error.message };
    }
}