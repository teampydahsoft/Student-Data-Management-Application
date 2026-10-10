import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { getAiApiBaseUrl } from '../config/aiConfig';

/**
 * PydahAiChat Component
 * Dynamic UMD CDN script loader for Pydah AI Chat UI.
 * Follows README Integration Method 2 (Section 3B):
 * - Sets window.PYDAH_AI_DISABLE_AUTO_MOUNT = true to prevent duplicate widget injection.
 * - Configures window.React, window.ReactDOM, and window.PYDAH_AI_API_URL globally.
 * - Injects layout guard CSS to prevent style.css resets from hiding host application sidebars.
 */
export default function PydahAiChat({
  mode = 'widget',
  assistantId: propsAssistantId,
  authToken: propsAuthToken,
  title = 'Pydah Student Assistant',
  welcomeMessage = 'How can I help you today?',
  position = 'bottom-right',
  apiBaseUrl: propsApiBaseUrl,
  ...restProps
}) {
  const location = useLocation();
  const { token: storeToken, userType } = useAuthStore();
  const [isLoaded, setIsLoaded] = useState(false);

  const isAiAssistantPage = location?.pathname?.endsWith('/ai-assistant');

  // Resolve active bearer token, assistant persona, and AI engine URL
  const activeToken = propsAuthToken || storeToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null);
  const activeAssistantId = propsAssistantId || 'student-assistant';
  const activeApiBaseUrl = propsApiBaseUrl || getAiApiBaseUrl();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Expose React & ReactDOM globally BEFORE UMD bundle executes to prevent React hook errors
      window.React = React;
      window.ReactDOM = ReactDOM;

      // Disable auto-mounting to prevent duplicate floating widgets on document.body
      window.PYDAH_AI_DISABLE_AUTO_MOUNT = true;

      window.PYDAH_AI_API_URL = activeApiBaseUrl;
      window.PYDAH_AI_ASSISTANT_ID = activeAssistantId;
      window.PYDAH_AI_TITLE = title;
      window.PYDAH_AI_WELCOME_MESSAGE = welcomeMessage;

      if (activeToken) {
        window.PYDAH_AI_AUTH_TOKEN = activeToken;
      }

      console.log(`🤖 [Pydah AI Chat UI] Connected AI Central Engine Base URL: ${activeApiBaseUrl}`);
      console.log(`🤖 [Pydah AI Chat UI] Persona: ${activeAssistantId} | Auth Token Present: ${!!activeToken}`);

      // Inject Stylesheet
      if (!document.getElementById('pydah-ai-style')) {
        const link = document.createElement('link');
        link.id = 'pydah-ai-style';
        link.rel = 'stylesheet';
        link.href = 'https://pydah-ai-chat-ui.vercel.app/style.css';
        document.head.appendChild(link);
      }

      // Inject Layout Guard Stylesheet to protect host layout sidebars from style.css resets
      if (!document.getElementById('pydah-ai-layout-guard')) {
        const guardStyle = document.createElement('style');
        guardStyle.id = 'pydah-ai-layout-guard';
        guardStyle.innerHTML = `
          @media (min-width: 1024px) {
            aside, aside.hidden.lg\\:flex, .lg\\:flex { display: flex !important; }
          }
          @media (min-width: 768px) {
            aside.md\\:flex, .md\\:flex { display: flex !important; }
          }
        `;
        document.head.appendChild(guardStyle);
      }

      // Inject Script
      if (!document.getElementById('pydah-ai-script')) {
        const script = document.createElement('script');
        script.id = 'pydah-ai-script';
        script.src = 'https://pydah-ai-chat-ui.vercel.app/index.umd.js';
        script.async = true;
        script.onload = () => setIsLoaded(true);
        document.body.appendChild(script);
      } else if (window.PydahAIChatUI) {
        setIsLoaded(true);
      }
    }
  }, [activeApiBaseUrl, activeAssistantId, activeToken, title, welcomeMessage]);

  // Hide floating widget button on dedicated AI Assistant page
  if (mode === 'widget' && isAiAssistantPage) {
    return null;
  }

  if (!isLoaded || typeof window === 'undefined' || !window.PydahAIChatUI) {
    return null;
  }

  const UIModule = window.PydahAIChatUI;
  const Component = mode === 'embedded'
    ? (UIModule.PydahAIChatPage || UIModule.default || UIModule)
    : (UIModule.PydahAIChatWidget || UIModule.default || UIModule);

  if (!Component) {
    return null;
  }

  return (
    <Component
      mode={mode}
      assistantId={activeAssistantId}
      authToken={activeToken}
      apiBaseUrl={activeApiBaseUrl}
      title={title}
      welcomeMessage={welcomeMessage}
      position={position}
      {...restProps}
    />
  );
}


