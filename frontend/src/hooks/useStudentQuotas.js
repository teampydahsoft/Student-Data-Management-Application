import { useState, useEffect, useCallback } from 'react';
import api from '../config/api';

export function useStudentQuotas({ includeInactive = false, publicOnly = false, enabled = true } = {}) {
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));

  const fetchQuotas = useCallback(async () => {
    if (!enabled) return [];

    try {
      setLoading(true);
      const endpoint = publicOnly
        ? '/quotas/public'
        : `/quotas${includeInactive ? '?includeInactive=true' : ''}`;
      const response = await api.get(endpoint);
      const data = response.data.data || [];
      setQuotas(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch student quotas', error);
      setQuotas([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled, includeInactive, publicOnly]);

  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  return { quotas, loading, refetch: fetchQuotas };
}

export default useStudentQuotas;
