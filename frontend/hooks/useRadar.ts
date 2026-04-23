"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';

interface Lead {
  name: string;
  phone: string;
  address?: string;
  rating?: number;
  website?: string;
}

interface RadarState {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  progress: number;
  results: Lead[];
  error?: string;
  remaining?: number;
}

export function useRadar() {
  const [state, setState] = useState<RadarState>({
    status: 'idle',
    progress: 0,
    results: [],
  });
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startSearch = useCallback(async (query: string, location: string) => {
    stopPolling();
    setState({ status: 'processing', progress: 0, results: [] });

    try {
      const data = await apiClient.startSearch(query, location);
      jobIdRef.current = data.jobId;

      setState(prev => ({ ...prev, remaining: data.remaining }));

      // Start polling every 2 seconds
      pollingRef.current = setInterval(async () => {
        try {
          const status = await apiClient.getSearchStatus(data.jobId);

          setState(prev => ({
            ...prev,
            status: status.status,
            progress: status.progress,
            results: status.results || prev.results,
            error: status.error,
          }));

          if (status.status === 'completed' || status.status === 'failed') {
            stopPolling();
          }
        } catch {
          stopPolling();
          setState(prev => ({ ...prev, status: 'failed', error: 'Erro ao verificar status' }));
        }
      }, 2000);

    } catch (error: any) {
      setState({
        status: 'failed',
        progress: 0,
        results: [],
        error: error.message || 'Erro ao iniciar busca',
        remaining: error.remaining,
      });
    }
  }, [stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return { ...state, startSearch };
}
