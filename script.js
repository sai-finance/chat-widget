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

// --- Global Variables ---
let gradioClient = null;
let isConnecting = false;
let isWaitingForResponse = false;
const gradioSpaceUrl = "https://maha001-sai-finance-assistant.hf.space/";
const API_ENDPOINT = "/chat"; // Default endpoint when api_name is not set

// --- Initialization Function ---
async function initChatWidget() {
    console.log(`[@gradio/client] Version check: ${Client.version || 'N/A'}`);
    if (!chatToggle || !chatContainer || !messagesContainer || !chatInput || !sendButton || !newChatButton || !closeChat || !errorDisplay) {
        console.error("Chat widget Init failed: Missing HTML elements.");
        return;
    }
    addEventListeners();
    await connectClient();
}

// --- Connection Logic ---
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
            appendMessage("Hi! How can I help you today?", 'bot');
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
}

// --- Chat Visibility ---
function toggleChat() { if (!chatContainer) return; chatContainer.classList.toggle('hidden'); if (!chatContainer.classList.contains('hidden')) { if (!gradioClient && !isConnecting) { connectClient(); } if (chatInput) { setTimeout(() => chatInput.focus(), 50); } } }
function hideChat() { if (chatContainer) chatContainer.classList.add('hidden'); }

// --- New Chat Function ---
function startNewChat() {
    console.log("[startNewChat] Starting new session...");
    if (messagesContainer) messagesContainer.innerHTML = '';
    clearError();
    appendMessage("New chat started.", 'bot');
    if (chatInput) chatInput.value = '';
    setLoadingState(false);
    if (chatInput) chatInput.focus();
    // Client-side reset primarily clears UI. Backend session might reset automatically
    // or require a specific endpoint if explicitly designed for it.
}

// --- Message Handling (Using predict with default endpoint) ---
async function handleSendMessage() {
    console.log("[handleSendMessage] Attempting send (predict). State:", { isConnecting, isWaitingForResponse, hasClient: !!gradioClient });

    if (isConnecting || isWaitingForResponse || !gradioClient) {
        console.warn("[handleSendMessage] Prevented: Busy or no client.");
        if(!gradioClient && !isConnecting) connectClient();
        return;
    }
    if (!chatInput || !messagesContainer) { console.error("[handleSendMessage] Prevented: Missing elements."); return; }

    const userMessage = chatInput.value.trim();
    if (!userMessage) return;

    appendMessage(userMessage, 'user');
    chatInput.value = '';
    scrollToBottom();
    setLoadingState(true, "Processing...");
    const thinkingIndicator = appendMessage("Thinking...", 'bot', true);
    clearError();

    // --- Payload format for predict ---
    const payload = {
        message: { "text": userMessage, "files": [] }
        // History is managed by the backend session for ChatInterface
    };
    console.log("[handleSendMessage] --- Calling predict ---");
    console.log("API Endpoint:", API_ENDPOINT);
    console.log("Payload:", JSON.stringify(payload, null, 2));

    try {
        // Use predict with the default API endpoint for ChatInterface
        const result = await gradioClient.predict(API_ENDPOINT, payload);

        console.log("[handleSendMessage] --- Received Result from predict ---");
        console.log(JSON.stringify(result, null, 2)); // Log the full result object

        // --- Flexible Response Parsing ---
        let botMessageText = null;
        // Check if result and result.data exist and have expected structure
        if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
            const firstItem = result.data[0];
            console.log("[handleSendMessage] Parsing result.data[0]:", firstItem);

            // Primarily expect a string based on Python yield
            if (typeof firstItem === 'string') {
                botMessageText = firstItem;
                console.log("[handleSendMessage] Parsed as string.");
            }
             // Add fallbacks only if necessary based on actual backend responses
            // else if (Array.isArray(firstItem)) { ... }
            // else if (typeof firstItem === 'object') { ... }
            else {
                 // If not string, try converting as a fallback
                 console.warn("[handleSendMessage] result.data[0] is not a string:", firstItem);
                 botMessageText = String(firstItem);
            }
        } else {
            console.warn("[handleSendMessage] Received invalid or empty result structure from predict:", result);
        }
        // --- End Parsing ---

        if (thinkingIndicator) thinkingIndicator.remove(); // Remove thinking indicator

        // Display parsed message or error
        if (botMessageText !== null && String(botMessageText).trim() !== '') {
            appendMessage(String(botMessageText), 'bot');
        } else {
            console.error("[handleSendMessage] Failed to parse a valid message from the response.");
            appendMessage('Sorry, I received an unclear response.', 'bot');
            showError("Received response, but couldn't understand it.");
        }

    } catch (error) {
        console.error('[handleSendMessage] --- ERROR during predict call ---');
        // Log the raw error for detailed diagnosis
        console.error("Raw error caught:", error);
        try { console.error("Error stringified:", JSON.stringify(error, null, 2)); } catch (e) { console.warn("Could not stringify error."); }
        console.dir(error); // Use console.dir for better object inspection

        if (thinkingIndicator) thinkingIndicator.remove(); // Ensure thinking indicator removed

        // Refined error message extraction - Check for Gradio status error object
        let errorMsg = 'Sorry, the assistant encountered a problem.'; // Default
        if (error instanceof Error) {
            errorMsg = `Error: ${error.message}`; // Standard JS error
        } else if (typeof error === 'object' && error !== null) {
            // Check specifically for the Gradio status error structure
             if (error.type === 'status' && error.stage === 'error') {
                 errorMsg = error.message || 'The assistant reported an internal error.';
                 console.log("[handleSendMessage] Interpreted error as Gradio status error.");
             } else if (error.message) { // Check if object has a message property
                 errorMsg = `Error: ${error.message}`;
             } else if (error.error) { // Check if object has an error property
                 errorMsg = `Error: ${error.error}`;
             } else { // If it's an object but we can't find a specific message
                 errorMsg = 'An unexpected error object was received.';
             }
         } else if (typeof error === 'string') { // If the error was just a string
            errorMsg = error;
        }
        // Add console hint if message is still generic
        if (errorMsg === 'Sorry, the assistant encountered a problem.' || errorMsg === 'An unexpected error object was received.') {
            errorMsg += ' (Check browser console for details)';
        }

        appendMessage(errorMsg, 'bot'); // Display extracted/generated error message
        showError("Couldn't get response. Check console or try again."); // Update error bar

    } finally {
        console.log("[handleSendMessage] --- FINALLY (predict) ---");
        setLoadingState(false); // Ensure UI is always re-enabled
        scrollToBottom();
    }
}


// --- DOM Manipulation & State ---
// (Keep appendMessage, scrollToBottom, setLoadingState, showError, clearError as before)
function appendMessage(text, sender, isThinking = false) { if (!messagesContainer) { console.error("Cannot append: messagesContainer not found."); return null; } const messageDiv = document.createElement('div'); messageDiv.classList.add('message', `${sender}-message`); if (isThinking) { messageDiv.classList.add('thinking'); messageDiv.setAttribute('role', 'status'); } const messageText = String(text || ''); if (sender === 'bot' && typeof marked !== 'undefined') { try { const dirtyHtml = marked.parse(messageText); const cleanHtml = dirtyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''); messageDiv.innerHTML = cleanHtml; } catch (e) { console.error("Markdown parsing error:", e); messageDiv.textContent = messageText; } } else { messageDiv.textContent = messageText; } messagesContainer.appendChild(messageDiv); scrollToBottom(); return messageDiv; }
function scrollToBottom() { setTimeout(() => { if (messagesContainer) { if (messagesContainer.scrollHeight > messagesContainer.clientHeight) { messagesContainer.scrollTop = messagesContainer.scrollHeight; } } }, 50); }
function setLoadingState(isLoading, message = "Ask a question...") { isWaitingForResponse = isLoading; if (chatInput) { chatInput.disabled = isLoading; const placeholderText = isLoading ? message : "Ask a question..."; if (chatInput.placeholder !== placeholderText) { chatInput.placeholder = placeholderText; } } if (sendButton) { sendButton.disabled = isLoading; } }
function showError(message) { if (!errorDisplay) return; errorDisplay.textContent = message; errorDisplay.classList.remove('hidden'); console.log("[showError] Error displayed:", message); }
function clearError() { if (!errorDisplay) return; if (!errorDisplay.classList.contains('hidden')) { errorDisplay.classList.add('hidden'); errorDisplay.textContent = ''; } }


// --- Start the Widget ---
document.addEventListener('DOMContentLoaded', initChatWidget);
