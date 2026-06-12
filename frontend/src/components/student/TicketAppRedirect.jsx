import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { navigateToTicketApp, resolveTicketAppRedirectPath } from '../../utils/ticketAppUrl';

const TicketAppRedirect = ({ redirectPath }) => {
  const { pathname } = useLocation();
  const targetPath = redirectPath || pathname;

  useEffect(() => {
    navigateToTicketApp(resolveTicketAppRedirectPath(targetPath));
  }, [targetPath]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-sm font-semibold text-gray-700">Opening Maintenance portal...</p>
    </div>
  );
};

export default TicketAppRedirect;
