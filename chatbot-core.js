import { showTypingIndicator, hideTypingIndicator, scrollToBottom, markdownToHtml } from './chatbot-utils.js';
import { getStaticResponse, getOpenAIResponse } from './chatbot-responses.js';

export class HollyChatbot {
    constructor() {
        this.isAuthenticated = false;
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendButton = document.getElementById('sendButton');
        this.pendingQuery = null;
        this.conversationHistory = [];
    }

    init() {
        if (this.sendButton && this.chatInput) {
            this.sendButton.addEventListener('click', () => this.handleSend());
            this.chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSend();
            });
        }
    }

    getAPIKey() {
        return window.ENV_OPENAI_API_KEY || null;
    }

    async handleSend() {
        const userInput = this.chatInput.value.trim();
        if (!userInput) return;

        if (!this.isAuthenticated) {
            return await this.requestPassword(userInput);
        }

        this.addMessage(userInput, 'user');
        this.chatInput.value = '';
        showTypingIndicator(this.chatMessages);

        try {
            const response = await this.generateResponse(userInput);
            hideTypingIndicator();
            this.typeOutResponse(response);
        } catch (err) {
            hideTypingIndicator();
            this.addMessage("⚠️ Error: Unable to respond. Please try again later.", "bot");
        }
    }

    async requestPassword(input) {
        if (!this.pendingQuery) {
            this.pendingQuery = input;
            this.chatInput.value = '';
            this.addMessage('🔒 Please enter the access password to continue.', 'bot');
            this.chatInput.placeholder = 'Enter password...';
            return;
        }

        try {
            const res = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: input })
            });

            const result = await res.json();
            if (res.ok) {
                this.isAuthenticated = true;
                this.addMessage('🎉 **Welcome!** Authentication successful.', 'bot');
                this.chatInput.placeholder = 'Ask about AI, partnerships, skills, or ITSTI vision...';

                const query = this.pendingQuery;
                this.pendingQuery = null;
                this.chatInput.value = query;
                this.handleSend();
            } else {
                this.chatInput.value = '';
                this.addMessage('❌ Incorrect password. Please try again.', 'bot');
            }
        } catch (err) {
            this.addMessage('⚠️ Error verifying password. Please try again.', 'bot');
        }
    }

    async generateResponse(message) {
        const apiKey = this.getAPIKey();
        let response = { answer: "", sources: [] };

        if (apiKey) {
            try {
                const result = await getOpenAIResponse(message, this.conversationHistory, apiKey);
            response = typeof result === 'string' ? { answer: result, sources: [] } : result;
            } catch (err) {
                console.error("API error", err);
            }
        }

        if (!response.answer) {
            response.answer = getStaticResponse(message);
        }

        this.conversationHistory.push({ role: "user", content: message });
        this.conversationHistory.push({ role: "assistant", content: response.answer });

        return response;
    }

    addMessage(text, sender) {
        const div = document.createElement('div');
        div.className = `message ${sender}`;
        div.innerHTML = `<p>${markdownToHtml(text)}</p>`;
        this.chatMessages.appendChild(div);
        scrollToBottom(this.chatMessages);
    }

    typeOutResponse(response) {
        let index = 0;
        const div = document.createElement('div');
        div.className = 'message bot';
        const p = document.createElement('p');
        div.appendChild(p);
        this.chatMessages.appendChild(div);

        const interval = setInterval(() => {
            p.innerHTML = markdownToHtml(response.answer.slice(0, index++));
            scrollToBottom(this.chatMessages);
            if (index > response.answer.length) {
                clearInterval(interval);
                if (response.sources.length) {
                    const sourceDiv = document.createElement('div');
                    sourceDiv.className = 'sources';
                    const sourceHtml = response.sources.map(s =>
                        `<div class="source-block"><strong>${s.label}:</strong> ${s.snippet}</div>`
                    ).join('<br>');
                    sourceDiv.innerHTML = `<hr><em>Sources:</em><br>${sourceHtml}`;
                    div.appendChild(sourceDiv);
                }

                clearInterval(interval);
            }
        }, 10);
    }
}