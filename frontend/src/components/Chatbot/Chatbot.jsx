import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import * as pdfjsLib from 'pdfjs-dist';
import './Chatbot.css';

// Initialize PDF.js worker using a reliable CDN path (version matched)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const Chatbot = () => {
  // Support both Vite (import.meta.env) and CRA (process.env)
  const getEnv = (key) => {
    const viteKey = `VITE_${key}`;
    const craKey = `REACT_APP_${key}`;
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        return import.meta.env[viteKey] || import.meta.env[craKey];
      }
    } catch (e) { }
    return process.env[craKey] || process.env[viteKey];
  };

  const API_BASE_URL = (getEnv('API_URL') || 'http://localhost:5001/api').replace(/\/$/, '');

  const [isOpen, setIsOpen] = useState(false);
  const [chats, setChats] = useState(() => {
    const savedChats = localStorage.getItem('chatbot_history');
    return savedChats ? JSON.parse(savedChats) : [];
  });
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // eslint-disable-line no-unused-vars
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [pendingFile, setPendingFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createNewChat = React.useCallback(() => {
    const newChat = {
      id: Date.now(),
      title: 'New Chat',
      messages: [
        {
          id: Date.now() + 1,
          text: "Hello! 👋 I'm your upgraded AI Assistant. How can I help you today?",
          sender: 'bot',
          timestamp: new Date().toISOString()
        }
      ],
      timestamp: new Date().toISOString()
    };
    setChats(prevChats => [newChat, ...prevChats]);
    setActiveChatId(newChat.id);
    setMessages(newChat.messages);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, []);

  // Initialize active chat or create first one
  useEffect(() => {
    if (chats.length > 0 && !activeChatId) {
      setActiveChatId(chats[0].id);
      setMessages(chats[0].messages);
    } else if (chats.length === 0 && !activeChatId) {
      createNewChat();
    }
  }, [chats, activeChatId, createNewChat]);

  // Save chats to localStorage
  useEffect(() => {
    localStorage.setItem('chatbot_history', JSON.stringify(chats));
  }, [chats]);

  // Scroll to bottom
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Markdown configuration
  useEffect(() => {
    const renderer = new marked.Renderer();
    renderer.code = (code, language) => {
      const validLang = !!(language && hljs.getLanguage(language));
      const highlighted = validLang ? hljs.highlight(code, { language }).value : hljs.highlightAuto(code).value;
      return `<div class="code-container">
                <div class="code-header">
                   <span>${language || 'code'}</span>
                   <button class="copy-code-btn" onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">Copy</button>
                </div>
                <pre><code class="hljs ${language}">${highlighted}</code></pre>
              </div>`;
    };

    marked.setOptions({
      renderer,
      highlight: function (code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true
    });
  }, []);

  const deleteChat = (e, chatId) => {
    e.stopPropagation();
    const updatedChats = chats.filter(c => c.id !== chatId);
    setChats(updatedChats);
    if (activeChatId === chatId) {
      if (updatedChats.length > 0) {
        setActiveChatId(updatedChats[0].id);
        setMessages(updatedChats[0].messages);
      } else {
        createNewChat();
      }
    }
  };

  const switchChat = (chatId) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChatId(chatId);
      setMessages(chat.messages);
      if (window.innerWidth <= 768) setSidebarOpen(false);
    }
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  };


  const generatePDFThumbnail = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 }); // High scale for better OCR/Vision quality
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: context, viewport: viewport }).promise;
      // Use JPEG with 0.5 quality to keep payload small but clear
      return canvas.toDataURL('image/jpeg', 0.5);
    } catch (err) {
      console.error("Error generating PDF thumbnail:", err);
      return null;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size exceeds 10MB limit.");
      return;
    }

    const extension = file.name.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension);
    const isPDF = extension === 'pdf';
    const category = isImage ? 'image' : 'file';

    let previewUrl = null;
    if (isImage) {
      previewUrl = await fileToBase64(file);
    } else if (isPDF) {
      previewUrl = await generatePDFThumbnail(file);
    }

    setPendingFile({
      file,
      type: category, // 'image' or 'file'
      name: file.name,
      preview: previewUrl,
      extension: extension
    });

    textareaRef.current?.focus();
  };

  const cancelPendingFile = () => {
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInputMessage(prev => prev + (prev ? ' ' : '') + transcript);
    };
    recognition.start();
  };

  const updateMessagesAndHistory = (newMessage) => {
    setMessages(prev => {
      const updated = [...prev, newMessage];
      // Update chat in history
      setChats(prevChats => prevChats.map(c => {
        if (c.id === activeChatId) {
          const isFirstRealMessage = c.messages.length === 1 && newMessage.sender === 'user';
          return {
            ...c,
            messages: updated,
            title: isFirstRealMessage ? (newMessage.text.substring(0, 30) || 'Image/File') : c.title,
            timestamp: new Date().toISOString()
          };
        }
        return c;
      }));
      return updated;
    });
  };

  const sendMessage = async (regenerateText = null) => {
    const messageToSend = regenerateText || inputMessage.trim();
    if (!messageToSend && !regenerateText && !pendingFile) return;

    let userMessageText = messageToSend;
    let fileToProcess = null;

    if (!regenerateText) {
      if (pendingFile) {
        fileToProcess = pendingFile;
        userMessageText = messageToSend || (pendingFile.type === 'image' ? "Analyze this image" : `Analyze ${pendingFile.name}`);

        const userMessage = {
          id: Date.now(),
          text: userMessageText,
          sender: 'user',
          timestamp: new Date().toISOString(),
          file: {
            name: pendingFile.name,
            type: pendingFile.file.type,
            size: pendingFile.file.size,
            preview: pendingFile.preview,
            category: pendingFile.type,
            extension: pendingFile.extension
          }
        };
        updateMessagesAndHistory(userMessage);
        setPendingFile(null);
      } else {
        const userMessage = {
          id: Date.now(),
          text: messageToSend,
          sender: 'user',
          timestamp: new Date().toISOString()
        };
        updateMessagesAndHistory(userMessage);
      }
      console.log(`[Chatbot] Sending message to: ${API_BASE_URL}`);
      setInputMessage('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }

    setIsTyping(true);
    setError('');

    try {
      let botReply = "";

      if (fileToProcess) {
        // Prepare FormData for file upload
        const formData = new FormData();
        formData.append('file', fileToProcess.file);
        formData.append('message', userMessageText);
        if (fileToProcess.preview) {
          formData.append('thumbnail', fileToProcess.preview);
        }
        formData.append('history', JSON.stringify(messages.slice(-10).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text
        }))));

        const payloadSize = JSON.stringify(Object.fromEntries(formData)).length;
        console.log(`[Chatbot] Sending file payload with size: ~${Math.round(payloadSize / 1024)} KB`);

        const response = await fetch(
          `${API_BASE_URL}/chatbot/message-with-file`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
          }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || data.error || `API Error: ${response.status}`);
        botReply = data.reply;
      } else {
        // Normal text message
        const response = await fetch(
          `${API_BASE_URL}/chatbot/message`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              message: messageToSend,
              history: messages.slice(-10).map(m => ({
                role: m.sender === 'user' ? 'user' : 'assistant',
                content: m.text
              }))
            })
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || data.error || `API Error: ${response.status}`);
        }

        botReply = data.reply || "I'm having trouble thinking of a response. Please try again.";
      }

      const botMessage = {
        id: Date.now() + 1,
        text: botReply,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        // Link bot message to the file it discussed
        file: fileToProcess ? {
          name: fileToProcess.name,
          type: fileToProcess.file.type,
          size: fileToProcess.file.size,
          preview: fileToProcess.preview,
          category: fileToProcess.type,
          extension: fileToProcess.extension
        } : null
      };

      updateMessagesAndHistory(botMessage);
    } catch (err) {
      console.error("Chatbot Fetch Error:", err);
      const isNetworkError = err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network');
      const userFriendlyError = isNetworkError 
        ? "Connection Error: The chatbot couldn't reach the server. Please check if your backend is running on port 5001."
        : `AI Error: ${err.message}`;
      setError(userFriendlyError);
      
      const botMessage = {
        id: Date.now() + 1,
        text: "⚠️ **System Error**: I encountered a connection issue while processing your request. Please ensure the backend server is running and try again.",
        sender: 'bot',
        timestamp: new Date().toISOString()
      };
      
      updateMessagesAndHistory(botMessage);
    } finally {
      setIsTyping(false);
      setUploadProgress(0);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // Could add a temporary "Copied!" toast here
  };

  const handlePaste = (e) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        handleFileUpload({ target: { files: [file] } }, 'image');
      }
    }
  };

  const regenerateResponse = () => {
    const lastUserMessage = [...messages].reverse().find(m => m.sender === 'user');
    if (lastUserMessage) {
      sendMessage(lastUserMessage.text);
    }
  };

  const deleteMessage = (msgId) => {
    setMessages(prev => {
      const updated = prev.filter(m => m.id !== msgId);
      setChats(prevChats => prevChats.map(c => {
        if (c.id === activeChatId) return { ...c, messages: updated };
        return c;
      }));
      return updated;
    });
  };

  return (
    <>
      <div className="chatbot-background" />

      <button
        className="chatbot-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle chat"
      >
        <span className="chat-icon">💬</span>
        <span className="pulse-ring"></span>
      </button>

      {isOpen && (
        <div className={`chatbot-container ${sidebarOpen ? 'sidebar-active' : ''}`}>
          <div className="chatbot-overlay" onClick={() => setIsOpen(false)} />

          <div className={`chatbot-panel open`}>
            {/* Sidebar */}
            <div className={`chatbot-sidebar ${sidebarOpen ? 'open' : ''}`}>
              <div className="sidebar-header">
                <button className="new-chat-btn" onClick={createNewChat}>
                  <span>+</span> New Chat
                </button>
              </div>
              <div className="chat-history-list">
                {chats.map(chat => (
                  <div
                    key={chat.id}
                    className={`history-item ${activeChatId === chat.id ? 'active' : ''}`}
                    onClick={() => switchChat(chat.id)}
                  >
                    <span className="chat-title">{chat.title}</span>
                    <button className="delete-chat-btn" onClick={(e) => deleteChat(e, chat.id)}>🗑️</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="chatbot-main">
              <div className="chatbot-header">
                <div className="header-left">
                  <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? '◀' : '▶'}
                  </button>
                  <div className="header-info">
                    <h3>✨ AI Assistant</h3>
                    <div className="status-indicator">
                      <span className="status-dot"></span>
                      <small>Online</small>
                    </div>
                  </div>
                </div>
                <div className="header-actions">
                  <button className="chatbot-close" onClick={() => setIsOpen(false)}>✕</button>
                </div>
              </div>

              <div className="chatbot-messages" onPaste={handlePaste}>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.sender === 'user' ? 'user-message' : 'bot-message'}`}
                  >
                    {message.sender === 'bot' && (
                      <div className="bot-avatar">✨</div>
                    )}
                    <div className="message-content">
                      <div className="message-wrapper">
                        <div className="message-bubble">
                          {message.file && (
                            <div className="file-preview">
                              {message.file.preview ? (
                                <div className="file-thumbnail-container">
                                  <img src={message.file.preview} alt="file preview" className="chat-image-thumbnail" />
                                  {message.file.extension === 'pdf' && <span className="pdf-badge">PDF</span>}
                                  <div className="file-overlay-info">
                                    <span className="file-name-overlay">{message.file.name}</span>
                                  </div>
                                </div>
                              ) : (
                                <div className={`file-icon-box file-type-${message.file.extension === 'pdf' ? 'pdf' : ['doc', 'docx'].includes(message.file.extension) ? 'doc' : ['xls', 'xlsx'].includes(message.file.extension) ? 'xls' : 'txt'}`}>
                                  <span>{message.file.extension === 'pdf' ? '📄' : ['xls', 'xlsx'].includes(message.file.extension) ? '📊' : '📝'}</span>
                                  <div className="file-details">
                                    <span className="file-name-text">{message.file.name}</span>
                                    <span className="file-size-text">{(message.file.size / 1024).toFixed(1)} KB</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div
                            dangerouslySetInnerHTML={{
                              __html: marked(message.text)
                            }}
                          />
                        </div>
                        <div className="message-actions">
                          <button onClick={() => copyToClipboard(message.text)} title="Copy">📋</button>
                          {message.sender === 'bot' && (
                            <>
                              <button onClick={regenerateResponse} title="Regenerate">🔄</button>
                              <button title="Thumbs Up">👍</button>
                              <button title="Thumbs Down">👎</button>
                            </>
                          )}
                          <button onClick={() => deleteMessage(message.id)} title="Delete">🗑️</button>
                        </div>
                      </div>
                      <div className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="message bot-message">
                    <div className="bot-avatar">✨</div>
                    <div className="message-content">
                      <div className="message-bubble typing-dots">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                )}

                {uploadProgress > 0 && (
                  <div className="upload-progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                  </div>
                )}

                {error && <div className="chatbot-error">⚠️ {error}</div>}
                <div ref={messagesEndRef} />
              </div>

              <div className="chatbot-input">
                {pendingFile && (
                  <div className="pending-file-preview">
                    <div className="preview-content">
                      {(pendingFile.type === 'image' || pendingFile.extension === 'pdf') && pendingFile.preview ? (
                        <div className="pending-thumbnail-wrapper">
                          <img src={pendingFile.preview} alt="pending" />
                          {pendingFile.extension === 'pdf' && <span className="pdf-mini-badge">PDF</span>}
                        </div>
                      ) : (
                        <div className={`preview-icon file-type-${pendingFile.extension === 'pdf' ? 'pdf' : ['doc', 'docx'].includes(pendingFile.extension) ? 'doc' : ['xls', 'xlsx'].includes(pendingFile.extension) ? 'xls' : 'txt'}`}>
                          {pendingFile.extension === 'pdf' ? '📄' : ['xls', 'xlsx'].includes(pendingFile.extension) ? '📊' : '📝'}
                        </div>
                      )}
                      <div className="preview-info">
                        <span className="file-name">{pendingFile.name}</span>
                        <span className="file-ready">Ready to upload with your message</span>
                      </div>
                    </div>
                    <button className="remove-file" onClick={cancelPendingFile}>✕</button>
                  </div>
                )}
                <div className="input-toolbar">
                  <button onClick={() => imageInputRef.current.click()} title="Upload Image">📷</button>
                  <button onClick={() => fileInputRef.current.click()} title="Upload File">📎</button>
                  <button
                    onClick={startVoiceInput}
                    className={isRecording ? 'recording' : ''}
                    title="Voice Input"
                  >
                    🎤
                  </button>
                  <input
                    type="file"
                    hidden
                    ref={imageInputRef}
                    accept="image/*"
                    onChange={handleFileUpload}
                  />
                  <input
                    type="file"
                    hidden
                    ref={fileInputRef}
                    accept=".pdf,.docx,.xlsx,.xls,.txt"
                    onChange={handleFileUpload}
                  />
                </div>
                <div className="input-container">
                  <textarea
                    ref={textareaRef}
                    rows="1"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Type your message..."
                    onInput={(e) => {
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                  />
                  <div className="input-controls">
                    <span className="char-count">{inputMessage.length}/2000</span>
                    <button
                      onClick={() => sendMessage()}
                      disabled={isTyping || (!inputMessage.trim() && !pendingFile)}
                      className="send-button"
                    >
                      ➤
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;

