// Import the Gradio Client library
import { Client } from "https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js";

// --- DOM Element References ---
const chatToggle = document.getElementById('chat-toggle');
const chatContainer = document.getElementById('chat-container');
const closeChat = document.getElementById('close-chat');
const newChatButton = document.getElementById('new-chat');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-message');
const messagesContainer = document.getElementById('chat-messages');
const errorDisplay = document.getElementById('chat-error');
// Language Buttons
const langButtonEn = document.getElementById('lang-en');
const langButtonTa = document.getElementById('lang-ta');

// --- Global Variables ---
let gradioClient = null;
let isConnecting = false;
let isWaitingForResponse = false;
const gradioSpaceUrl = "https://maha001-sai-finance-assistant.hf.space/";
const API_ENDPOINT = "/chat"; // Default endpoint
let currentLanguage = 'en'; // Default language ('en' or 'ta')

// Language-specific placeholders (example)
const placeholders = {
    en: "Ask a question...",
    ta: "கேள்வி கேளுங்கள்..." // Tamil placeholder
};

// --- Initialization Function ---
async function initChatWidget() {
    console.log(`[@gradio/client] Version check: ${Client.version || 'N/A'}`);
    if (!chatToggle || !chatContainer || !messagesContainer || !chatInput || !sendButton || !newChatButton || !closeChat || !errorDisplay || !langButtonEn || !langButtonTa) {
        console.error("Chat widget Init failed: Missing one or more HTML elements.");
        return;
    }
    addEventListeners();
    setLanguage(currentLanguage); // Set initial language UI
    await connectClient();
}

// --- Connection Logic (Keep as before) ---
async function connectClient() {
    if (isConnecting || gradioClient) return;
    isConnecting = true;
    setLoadingState(true, "Connecting...");
    console.log("[connectClient] Connecting to:", gradioSpaceUrl);
    try {
        gradioClient = await Client.connect(gradioSpaceUrl);
        console.log("[connectClient] Connected.");
        clearError();
        setLoadingState(false);
        if (messagesContainer && messagesContainer.children.length === 0) {
            // Display welcome based on current language? Optional.
            appendMessage(currentLanguage === 'en' ? "Hi! How can I help you today?" : "வணக்கம்! நான் உங்களுக்கு எப்படி உதவ முடியும்?", 'bot');
        }
        isConnecting = false;
    } catch (error) {
        console.error('[connectClient] CONNECTION FAILED:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error.';
        showError(`Connection failed: ${errorMsg}. Try again later.`);
        setLoadingState(false, "Connection failed");
        isConnecting = false;
        gradioClient = null;
    }
}

// --- Set Language Function ---
function setLanguage(lang) {
    if (lang !== 'en' && lang !== 'ta') {
        console.warn("Unsupported language:", lang);
        return;
    }
    currentLanguage = lang;
    console.log("[setLanguage] Language set to:", currentLanguage);

    // Update button active state
    if (langButtonEn && langButtonTa) {
        langButtonEn.classList.toggle('active', currentLanguage === 'en');
        langButtonTa.classList.toggle('active', currentLanguage === 'ta');
    }

    // Update placeholder text
    if (chatInput) {
        chatInput.placeholder = placeholders[currentLanguage] || placeholders['en'];
    }

    // Optional: Clear chat or add a notification if language changes mid-conversation?
    // For simplicity, we won't clear it now.
}

// --- Event Listener Setup ---
function addEventListeners() {
    if (chatToggle) chatToggle.addEventListener('click', toggleChat);
    if (closeChat) closeChat.addEventListener('click', hideChat);
    if (newChatButton) newChatButton.addEventListener('click', startNewChat);
    if (sendButton) sendButton.addEventListener('click', handleSendMessage);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
        });
        chatInput.addEventListener('focus', () => {
            if (!gradioClient && !isConnecting) { connectClient(); }
        });
    }
    // Add listeners for language buttons
    if (langButtonEn) langButtonEn.addEventListener('click', () => setLanguage('en'));
    if (langButtonTa) langButtonTa.addEventListener('click', () => setLanguage('ta'));
}

// --- Chat Visibility (Keep as before) ---
function toggleChat() { if (!chatContainer) return; chatContainer.classList.toggle('hidden'); if (!chatContainer.classList.contains('hidden')) { if (!gradioClient && !isConnecting) { connectClient(); } if (chatInput) { setTimeout(() => chatInput.focus(), 50); } } }
function hideChat() { if (chatContainer) chatContainer.classList.add('hidden'); }

// --- New Chat Function (Keep as before) ---
function startNewChat() {
    console.log("[startNewChat] Starting new session...");
    if (messagesContainer) messagesContainer.innerHTML = '';
    clearError();
    appendMessage(currentLanguage === 'en' ? "New chat started." : "புதிய உரையாடல் தொடங்கப்பட்டது.", 'bot');
    if (chatInput) chatInput.value = '';
    setLoadingState(false);
    if (chatInput) chatInput.focus();
}

// --- Message Handling (PREPEND LANGUAGE INSTRUCTION) ---
async function handleSendMessage() {
    console.log("[handleSendMessage] Attempting send (predict). State:", { isConnecting, isWaitingForResponse, hasClient: !!gradioClient, lang: currentLanguage });

    if (isConnecting || isWaitingForResponse || !gradioClient) { /* ... (keep checks) ... */ return; }
    if (!chatInput || !messagesContainer) { /* ... (keep checks) ... */ return; }

    const userMessageOriginal = chatInput.value.trim(); // Store original message for display
    if (!userMessageOriginal) return;

    // *** IMPORTANT: Display the ORIGINAL message, not the modified one ***
    appendMessage(userMessageOriginal, 'user');
    chatInput.value = '';
    scrollToBottom();
    setLoadingState(true, "Processing...");
    const thinkingIndicator = appendMessage("Thinking...", 'bot', true);
    clearError();

    // --- CONSTRUCT MESSAGE WITH LANGUAGE INSTRUCTION ---
    let messageToSend;
    if (currentLanguage === 'ta') {
        messageToSend = `Please respond ONLY in Tamil (தமிழ்): ${userMessageOriginal}`;
    } else { // Default to English
        messageToSend = `Please respond ONLY in English: ${userMessageOriginal}`;
    }
    // --- END MESSAGE CONSTRUCTION ---

    const payload = {
        message: { "text": messageToSend, "files": [] }
    };
    console.log("[handleSendMessage] --- Calling predict ---");
    console.log("API Endpoint:", API_ENDPOINT);
    console.log("Payload (with instruction):", JSON.stringify(payload, null, 2));

    try {
        const result = await gradioClient.predict(API_ENDPOINT, payload);

        console.log("[handleSendMessage] --- Received Result from predict ---");
        console.log(JSON.stringify(result, null, 2));

        // --- Flexible Response Parsing (Keep as before) ---
        let botMessageText = null;
        if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
            const firstItem = result.data[0];
            console.log("[handleSendMessage] Parsing result.data[0]:", firstItem);
            if (typeof firstItem === 'string') {
                botMessageText = firstItem;
                console.log("[handleSendMessage] Parsed as string.");
            } else {
                 console.warn("[handleSendMessage] result.data[0] is not a string:", firstItem);
                 botMessageText = String(firstItem);
            }
        } else { console.warn("[handleSendMessage] Received invalid/empty result structure:", result); }
        // --- End Parsing ---

        if (thinkingIndicator) thinkingIndicator.remove();

        if (botMessageText !== null && String(botMessageText).trim() !== '') {
            appendMessage(String(botMessageText), 'bot');
        } else {
            console.error("[handleSendMessage] Failed to parse valid message from response.");
            appendMessage('Sorry, I received an unclear response.', 'bot');
            showError("Received response, but couldn't understand it.");
        }

    } catch (error) {
        console.error('[handleSendMessage] --- ERROR during predict call ---');
        console.error("Raw error caught:", error);
        try { console.error("Error stringified:", JSON.stringify(error, null, 2)); } catch (e) { console.warn("Could not stringify error."); }
        console.dir(error);

        if (thinkingIndicator) thinkingIndicator.remove();

        // Refined error message extraction
        let errorMsg = 'Sorry, the assistant encountered a problem.';
        if (error instanceof Error) { errorMsg = `Error: ${error.message}`; }
        else if (typeof error === 'object' && error !== null) {
             if (error.type === 'status' && error.stage === 'error') { errorMsg = error.message || 'Assistant reported an internal error.'; }
             else if (error.message) { errorMsg = `Error: ${error.message}`; }
             else if (error.error) { errorMsg = `Error: ${error.error}`; }
             else { errorMsg = 'An unexpected error object was received.'; }
         } else if (typeof error === 'string') { errorMsg = error; }
         if (errorMsg === 'Sorry, the assistant encountered a problem.' || errorMsg === 'An unexpected error object was received.') { errorMsg += ' (Check console for details)'; }

        appendMessage(errorMsg, 'bot');
        showError("Couldn't get response. Check console or try again.");

    } finally {
        console.log("[handleSendMessage] --- FINALLY (predict) ---");
        setLoadingState(false);
        scrollToBottom();
    }
}


// --- DOM Manipulation & State ---
// (Keep appendMessage, scrollToBottom, setLoadingState, showError, clearError as before)
function appendMessage(text, sender, isThinking = false) { if (!messagesContainer) { console.error("Cannot append: messagesContainer not found."); return null; } const messageDiv = document.createElement('div'); messageDiv.classList.add('message', `${sender}-message`); if (isThinking) { messageDiv.classList.add('thinking'); messageDiv.setAttribute('role', 'status'); } const messageText = String(text || ''); if (sender === 'bot' && typeof marked !== 'undefined') { try { const dirtyHtml = marked.parse(messageText); const cleanHtml = dirtyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); messageDiv.innerHTML = cleanHtml; } catch (e) { console.error("Markdown parsing error:", e); messageDiv.textContent = messageText; } } else { messageDiv.textContent = messageText; } messagesContainer.appendChild(messageDiv); scrollToBottom(); return messageDiv; }
function scrollToBottom() { setTimeout(() => { if (messagesContainer) { if (messagesContainer.scrollHeight > messagesContainer.clientHeight) { messagesContainer.scrollTop = messagesContainer.scrollHeight; } } }, 50); }
function setLoadingState(isLoading, message = "Ask a question...") { isWaitingForResponse = isLoading; if (chatInput) { chatInput.disabled = isLoading; const placeholderText = isLoading ? message : placeholders[currentLanguage] || placeholders['en']; if (chatInput.placeholder !== placeholderText) { chatInput.placeholder = placeholderText; } } if (sendButton) { sendButton.disabled = isLoading; } }
function showError(message) { if (!errorDisplay) return; errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.log("[showError] Error displayed:", message); }
function clearError() { if (!errorDisplay) return; if (!errorDisplay.classList.contains('hidden')) { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; } }


// --- Start the Widget ---
document.addEventListener('DOMContentLoaded', initChatWidget);
