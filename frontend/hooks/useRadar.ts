"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type TriState = 'any' | 'has' | 'none';

export interface RadarFilters {
  phone?: TriState;
  website?: TriState;
  instagram?: TriState;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  address?: string;
  website?: string;
  instagram?: string;
  status: string;
  recommendedScriptId?: string;
  // Maps enrichment (added in radar v2)
  mapsUrl?: string | null;
  placeId?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  city?: string | null;
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Merge leads by id: never lose a lead the SSE stream already showed, never
  // duplicate one the DB poll returns. The DB is the source of truth, so this
  // recovers anything missed while the connection was dropped.
  const mergeLeads = (prev: Lead[], incoming: Lead[]): Lead[] => {
    const byId = new Map<string, Lead>();
    for (const l of prev) byId.set(l.id, l);
    for (const l of incoming) byId.set(l.id, l);
    return Array.from(byId.values());
  };

  const startSearch = useCallback(async (query: string, cities: string[], filters?: RadarFilters) => {
    stopStreaming();
    setState({ status: 'processing', results: [] });

    try {
      const data = await apiClient.startSearch(query, cities, filters);
      const jobId = data.jobId;
      const token = localStorage.getItem("cz_token");

      setState(prev => ({ ...prev, remaining: data.remaining }));

      // ── Live stream (Server-Sent Events) ──
      // Token goes in the URL because EventSource can't send headers.
      const sseUrl = `${API_URL}/api/radar/stream/${jobId}?token=${token}`;
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
            results: mergeLeads(prev.results, [leadOrEvent]),
          }));
        }
      };

      eventSource.onerror = () => {
        // EventSource auto-reconnects, but on mobile the connection can drop
        // for good (carrier NAT / backgrounded tab). The poll below is the
        // safety net that still finishes the job, so just log here.
        console.error("SSE Connection Error");
      };

      // ── Polling fallback ──
      // Mobile connections frequently drop mid-scrape; when SSE reconnects it
      // gets a fresh Redis subscriber and misses everything published during
      // the gap (incl. COMPLETED). Polling the DB snapshot guarantees the user
      // still gets every lead and a final status. Stops itself after ~6min.
      const startedAt = Date.now();
      pollRef.current = setInterval(async () => {
        try {
          if (Date.now() - startedAt > 6 * 60 * 1000) {
            stopStreaming();
            setState(prev => prev.status === 'processing' ? { ...prev, status: 'completed' } : prev);
            return;
          }
          const snap = await apiClient.getRadarJob(jobId);
          setState(prev => {
            const merged = mergeLeads(prev.results, snap.leads || []);
            if (snap.status === 'completed' || snap.status === 'failed') {
              stopStreaming();
              return {
                ...prev,
                results: merged,
                status: snap.status,
                error: snap.status === 'failed' ? 'Falha na extração de dados.' : prev.error,
              };
            }
            return { ...prev, results: merged };
          });
        } catch {
          // transient — keep trying until the time cap
        }
      }, 6000);

    } catch (error: any) {
      stopStreaming();
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
