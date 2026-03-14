# Chatbot Widget

A floating chatbot widget that connects to your Hugging Face Space for AI-powered conversations.

## Features

- 💬 Floating chat button with smooth animations
- 🤖 AI assistant integration with Hugging Face
- 📱 Fully responsive design for mobile and desktop
- ✨ Beautiful glassmorphic design
- ⌨️ Keyboard support (Enter to send)
- 🔄 Typing indicators
- ❌ Error handling with user-friendly messages
- 🎯 Fixed positioning (z-index: 9999)

## Setup

1. **Add your Hugging Face token to `.env`:**
   ```
   HF_TOKEN=hf_your_actual_token_here
   VITE_HF_SPACE_URL=https://sadiyabanu-my-chatbot.hf.space
   ```

2. **The chatbot will automatically appear on all pages** as a floating button in the bottom-right corner.

## Usage

- Click the 💬 button to open the chat panel
- Type your message and press Enter or click Send
- The AI assistant will respond from your Hugging Face Space
- Click ✕ to close the chat panel

## Customization

### Styling
Edit `Chatbot.css` to customize:
- Colors and gradients
- Button sizes and positions
- Animation timings
- Message bubble styles

### API Integration
Edit `Chatbot.jsx` to modify:
- API endpoint URL
- Request/response format
- Error handling logic

## Technical Details

- **Framework:** React with hooks
- **API:** Hugging Face Space integration
- **Styling:** Pure CSS with animations
- **Responsive:** Mobile-first design
- **Accessibility:** ARIA labels and keyboard support

## Troubleshooting

1. **Chatbot not appearing:** Check that the component is imported in App.jsx
2. **API errors:** Verify your HF_TOKEN and VITE_HF_SPACE_URL in .env
3. **Styling issues:** Check z-index conflicts with other elements
