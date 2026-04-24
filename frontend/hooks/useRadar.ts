"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Lead {
  id: string;
  name: string;
  phone: string;
  address?: string;
  website?: string;
  instagram?: string;
  status: string;
  recommendedScriptId?: string;
}

interface RadarState {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  results: Lead[];
  error?: string;
  remaining?: number;
}

export function useRadar() {
  const [state, setState] = useState<RadarState>({
    status: 'idle',
    results: [],
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startSearch = useCallback(async (query: string, city: string) => {
    stopStreaming();
    setState({ status: 'processing', results: [] });

    try {
      const data = await apiClient.startSearch(query, city);
      const token = localStorage.getItem("cz_token");

      setState(prev => ({ ...prev, remaining: data.remaining }));

      // Setup Server-Sent Events Connection
      // Using URL parameters for auth because EventSource doesn't support headers natively
      const sseUrl = `${API_URL}/api/radar/stream/${data.jobId}?token=${token}`;
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const leadOrEvent = JSON.parse(event.data);

        if (leadOrEvent.event === 'COMPLETED') {
          setState(prev => ({ ...prev, status: 'completed' }));
          stopStreaming();
        } else if (leadOrEvent.event === 'FAILED') {
          setState(prev => ({ ...prev, status: 'failed', error: 'Falha na extração de dados.' }));
          stopStreaming();
        } else if (leadOrEvent.event !== 'CONNECTED') {
          // This is a scraped lead
          setState(prev => ({
            ...prev,
            results: [...prev.results, leadOrEvent]
          }));
        }
      };

      eventSource.onerror = () => {
        // SSE will try to reconnect automatically, but if we get an error it's safer to show some issue
        console.error("SSE Connection Error");
      };

    } catch (error: any) {
      setState({
        status: 'failed',
        results: [],
        error: error.message || 'Erro ao iniciar busca',
        remaining: error.remaining,
      });
    }
  }, [stopStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStreaming();
  }, [stopStreaming]);

  return { ...state, startSearch };
}
