// DOM Elements
const chatArea = document.getElementById('chat-area');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const typingIndicator = document.getElementById('typing');
const welcome = document.getElementById('welcome');

// Configuration
const API_KEY = "AIzaSyC7InS1_kGyy54sJgW_tMdW3GEuclBL0OM";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// Conversation history
const conversation = [
  { role: "system", content: "You are a helpful AI assistant. Be concise and accurate." }
];

// Utility Functions
const getTime = () => {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Create and add message to chat
const addMessage = (type, text) => {
  // Hide welcome message on first user message
  if (type === 'user') {
    welcome.classList.add('hidden');
  }

  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  
  const avatarEl = document.createElement('div');
  avatarEl.className = 'avatar';
  avatarEl.textContent = type === 'user' ? 'U' : 'AI';
  
  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  
  const textEl = document.createElement('div');
  textEl.textContent = text;
  
  const timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = getTime();
  
  contentEl.appendChild(textEl);
  contentEl.appendChild(timeEl);
  
  messageEl.appendChild(avatarEl);
  messageEl.appendChild(contentEl);
  
  chatArea.appendChild(messageEl);
  chatArea.scrollTop = chatArea.scrollHeight;
  
  return messageEl;
};

// Show/hide typing indicator
const setTyping = (isTyping) => {
  typingIndicator.style.display = isTyping ? 'flex' : 'none';
  chatArea.scrollTop = chatArea.scrollHeight;
};

// Handle API response
const getAIResponse = async (userMessage) => {
  conversation.push({ role: "user", content: userMessage });
  
  try {
    setTyping(true);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: conversation,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const aiMessage = data.choices?.[0]?.message?.content || "I apologize, but I couldn't generate a response.";
    
    conversation.push({ role: "assistant", content: aiMessage });
    return aiMessage;
    
  } catch (error) {
    console.error('API Error:', error);
    return "Sorry, I'm having trouble connecting right now. Please try again.";
  } finally {
    setTyping(false);
  }
};

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const message = userInput.value.trim();
  if (!message) return;
  
  // Add user message
  addMessage('user', message);
  userInput.value = '';
  userInput.focus();
  
  // Get and add AI response
  const aiResponse = await getAIResponse(message);
  addMessage('bot', aiResponse);
});

// Quick action buttons
document.querySelectorAll('.quick-action').forEach(button => {
  button.addEventListener('click', () => {
    const prompt = button.dataset.prompt;
    userInput.value = prompt;
    chatForm.dispatchEvent(new Event('submit'));
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    chatForm.dispatchEvent(new Event('submit'));
  }
  
  if (e.key === 'Escape') {
    userInput.value = '';
    userInput.blur();
  }
});

// Auto-focus input on load
window.addEventListener('load', () => {
  userInput.focus();
});

// Keep input focused after sending
chatForm.addEventListener('submit', () => {
  setTimeout(() => userInput.focus(), 50);
});