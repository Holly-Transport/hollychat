// Entry point that binds HollyChatbot to the DOM
import { HollyChatbot } from './chatbot-core.js';

document.addEventListener('DOMContentLoaded', () => {
    const bot = new HollyChatbot();
    bot.init();
});
