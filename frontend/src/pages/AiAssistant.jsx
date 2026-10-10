import React from 'react';
import PydahAiChat from '../components/PydahAiChat';

export default function AiAssistant() {
  return (
    <div className="h-[calc(100vh-4.25rem)] w-full flex flex-col overflow-hidden bg-slate-50 relative p-4">
      <PydahAiChat
        mode="embedded"
        title="Pydah AI Assistant"
        welcomeMessage="Ask questions about your profile, attendance, and grades."
      />
    </div>
  );
}
