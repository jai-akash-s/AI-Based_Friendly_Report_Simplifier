import React, { useState, useEffect, useRef } from 'react';
import {
  AlertCircle, Bot, CornerDownLeft, MessageSquare, Mic, MicOff,
  Send, ShieldCheck, Sparkles, User, X
} from 'lucide-react';
import { api } from '../../api/client';

export function HealthChatDrawer({ isOpen, onClose, report, patient }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Setup Web Speech Recognition for voice queries
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript || '';
        if (transcript) {
          setInput((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
        }
        setIsListening(false);
      };

      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  // Initialize conversation when drawer opens or report changes
  useEffect(() => {
    if (isOpen) {
      const patientName = patient?.full_name || 'there';
      const hasLabs = (report?.lab_results || []).length > 0;
      const initialSuggestions = hasLabs
        ? [
            'What do my abnormal results mean?',
            'What foods should I eat or avoid?',
            'What questions should I ask my doctor?',
            'Are my medicines safe to take together?',
          ]
        : [
            'Can you explain my report in simple words?',
            'What questions should I bring to my doctor?',
            'What dietary habits support my health?',
          ];

      setMessages([
        {
          id: 'welcome',
          sender: 'assistant',
          text: `Hello ${patientName}! I'm your **Health Clarity Assistant**. I can help explain medical terms, laboratory values, dietary considerations, and questions for your doctor.\n\nWhat would you like to understand better about your report today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setSuggestions(initialSuggestions);
    }
  }, [isOpen, report?.id]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, busy, isOpen]);

  if (!isOpen) return null;

  const handleSend = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || busy) return;

    const userMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setBusy(true);

    try {
      const endpoint = report?.id ? `/api/reports/${report.id}/chat` : '/api/chat';
      const payload = {
        message: query,
        report_id: report?.id,
        report_context: report || {},
        patient_context: patient || {},
        history: messages.slice(-6).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
      };

      const res = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const assistantMessage = {
        id: `a-${Date.now()}`,
        sender: 'assistant',
        text: res.reply || 'I could not generate an answer right now. Please consult your physician.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (Array.isArray(res.suggestions) && res.suggestions.length > 0) {
        setSuggestions(res.suggestions);
      }
    } catch (err) {
      const errorMessage = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Notice:** ${err.message || 'Unable to connect to clarity assistant. Please try again or ask your doctor.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setBusy(false);
    }
  };

  const reportTitle = report?.title || report?.filename || 'Active Health Record';

  return (
    <div className="health-chat-overlay" onClick={onClose}>
      <aside
        className="health-chat-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Health Clarity Assistant"
      >
        {/* Drawer Header */}
        <div className="health-chat-header">
          <div className="chat-header-title">
            <div className="chat-icon-avatar">
              <Sparkles size={18} />
            </div>
            <div>
              <h3>Health Clarity Assistant</h3>
              <p className="chat-subtitle" title={reportTitle}>
                {reportTitle.length > 35 ? `${reportTitle.slice(0, 35)}…` : reportTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="chat-close-btn"
            onClick={onClose}
            aria-label="Close Assistant"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conversation Body */}
        <div className="health-chat-messages">
          <div className="chat-disclaimer-pill">
            <ShieldCheck size={13} /> Educational Clarity Aid · Not a Medical Diagnosis
          </div>

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble-row ${msg.sender === 'user' ? 'user-row' : 'assistant-row'}`}
            >
              {msg.sender === 'assistant' && (
                <div className="chat-avatar bot-avatar">
                  <Bot size={15} />
                </div>
              )}
              <div className={`chat-bubble ${msg.sender === 'user' ? 'user-bubble' : 'assistant-bubble'}`}>
                <div className="chat-bubble-content">
                  {msg.text.split('\n').map((line, i) => (
                    <p key={i} style={{ margin: line ? '0 0 6px' : '0 0 10px' }}>
                      {renderFormattedLine(line)}
                    </p>
                  ))}
                </div>
                <span className="chat-bubble-time">{msg.timestamp}</span>
              </div>
              {msg.sender === 'user' && (
                <div className="chat-avatar user-avatar">
                  <User size={15} />
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div className="chat-bubble-row assistant-row">
              <div className="chat-avatar bot-avatar">
                <Bot size={15} />
              </div>
              <div className="chat-bubble assistant-bubble typing-bubble">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Quick Prompt Chips */}
        {suggestions.length > 0 && !busy && (
          <div className="chat-suggestions-container">
            <span className="suggestions-label">Suggested Questions:</span>
            <div className="suggestions-scroll">
              {suggestions.map((sug, i) => (
                <button
                  key={i}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => handleSend(sug)}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <form
          className="health-chat-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <button
            type="button"
            className={`chat-dictate-btn ${isListening ? 'listening' : ''}`}
            onClick={toggleListening}
            title={isListening ? 'Stop Listening' : 'Speak your question'}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
          </button>
          <input
            type="text"
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about lab results, diet, or questions for your doctor..."
            disabled={busy}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </form>
      </aside>
    </div>
  );
}

function renderFormattedLine(line) {
  if (!line) return null;
  // Handle bold markdown **text**
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
