const API_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : '/api';

const chatMessages = document.getElementById('chatMessages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const quickBtns = document.querySelectorAll('.quick-btn');

let conversationId = 'user_' + Date.now();
let isProcessing = false;

// Add message to chat
function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (isUser) {
        contentDiv.textContent = content;
    } else {
        contentDiv.innerHTML = `<strong>Financial Advisor:</strong> ${formatMessage(content)}`;
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Format bot messages (convert markdown-like syntax)
function formatMessage(text) {
    // Convert markdown headings ###, ##, # into bold titles
    text = text.replace(/^#{1,6}\s*(.*)$/gm, '<strong>$1</strong>');

    // Convert **bold** to <strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    
    // Convert line breaks to <br>
    text = text.replace(/\n/g, '<br>');
    
    // Convert numbered lists
    text = text.replace(/^\d+\.\s/gm, '<br>• ');
    
    return text;
}

// Add loading indicator
function addLoadingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot-message';
    messageDiv.id = 'loading-indicator';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '<strong>Financial Advisor:</strong> <span class="loading">Thinking</span>';
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Remove loading indicator
function removeLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

// Send message to API
async function sendMessage(message) {
    if (!message.trim() || isProcessing) return;
    
    isProcessing = true;
    sendBtn.disabled = true;
    userInput.disabled = true;
    
    // Add user message
    addMessage(message, true);
    userInput.value = '';
    
    // Add loading indicator
    addLoadingIndicator();
    
    try {
        const response = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                conversationId: conversationId
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get response');
        }
        
        const data = await response.json();
        
        // Remove loading and add bot response
        removeLoadingIndicator();
        addMessage(data.response);
        
    } catch (error) {
        console.error('Error:', error);
        removeLoadingIndicator();
        addMessage('Sorry, I encountered an error. Please make sure the backend server is running and try again.');
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}

// Clear conversation
async function clearConversation() {
    if (!confirm('Are you sure you want to clear the chat history?')) return;
    
    try {
        await fetch(`${API_URL}/clear`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                conversationId: conversationId
            })
        });
        
        // Clear UI
        chatMessages.innerHTML = '';
        
        // Add welcome message
        addMessage(`Hello! I'm your financial assistant. I can help you with questions about:
        <ul>
            <li>📊 Taxation (Income Tax, GST, Deductions)</li>
            <li>💹 Mutual Funds (SIP, Types, NAV)</li>
            <li>🛡️ Insurance (Life, Health, Term Plans)</li>
            <li>🏛️ Government Schemes (PPF, EPF, SSY)</li>
        </ul>
        What would you like to know?`);
        
        // Generate new conversation ID
        conversationId = 'user_' + Date.now();
        
    } catch (error) {
        console.error('Error clearing conversation:', error);
        alert('Failed to clear conversation');
    }
}

// Event listeners
sendBtn.addEventListener('click', () => {
    sendMessage(userInput.value);
});

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(userInput.value);
    }
});

clearBtn.addEventListener('click', clearConversation);

// Quick question buttons
quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const question = btn.getAttribute('data-question');
        userInput.value = question;
        sendMessage(question);
    });
});

// Focus input on load
userInput.focus();