import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * PydahAiChat Component
 * Wraps the CDN-loaded PydahAIChatUI library (https://pydah-ai.netlify.app/index.umd.js)
 * 
 * Props:
 * - mode: 'widget' | 'embedded' (default: 'widget')
 * - title: string (default: "Pydah Student Assistant")
 * - welcomeMessage: string (default: "How can I help you today?")
 * - position: 'bottom-right' | 'bottom-left' (default: 'bottom-right')
 * - apiBaseUrl: string (default: "https://pydah-ai-api.onrender.com")
 */
export default function PydahAiChat({
  mode = 'widget',
  title = 'Pydah Student Assistant',
  welcomeMessage = 'How can I help you today?',
  position = 'bottom-right',
  apiBaseUrl = 'https://pydah-ai-api.onrender.com',
  ...restProps
}) {
  const [isLoaded, setIsLoaded] = useState(
    typeof window !== 'undefined' && !!window.PydahAIChatUI
  );
  const location = useLocation();

  const isAiAssistantPage = location?.pathname?.endsWith('/ai-assistant');

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.React) {
      window.React = React;
    }

    if (typeof window !== 'undefined' && window.PydahAIChatUI) {
      setIsLoaded(true);
      return;
    }

    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && window.PydahAIChatUI) {
        setIsLoaded(true);
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Hide the floating widget button on dedicated AI Assistant pages
  if (mode === 'widget' && isAiAssistantPage) {
    return null;
  }

  if (!isLoaded || typeof window === 'undefined' || !window.PydahAIChatUI) {
    if (mode === 'embedded') {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-slate-50 p-6 text-slate-500 min-h-[400px]">
          <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin mb-3"></div>
          <p className="text-sm font-medium">Connecting to Pydah AI Assistant...</p>
        </div>
      );
    }
    return null;
  }

  const Component = mode === 'embedded'
    ? (window.PydahAIChatUI.PydahAIChatPage || window.PydahAIChatUI.PydahAIChatUI || window.PydahAIChatUI.default)
    : (window.PydahAIChatUI.PydahAIChatWidget || window.PydahAIChatUI.PydahAIChatUI || window.PydahAIChatUI.default);

  if (!Component) return null;

  const renderedElement = React.createElement(Component, {
    mode,
    title,
    welcomeMessage,
    position,
    apiBaseUrl,
    ...restProps
  });

  if (mode === 'embedded') {
    return (
      <div className="w-full h-full flex-1 relative overflow-hidden [&>div]:!h-full [&>div]:!w-full [&>div]:!max-h-full">
        {renderedElement}
      </div>
    );
  }

  return renderedElement;
}
