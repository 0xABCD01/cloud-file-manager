/**
 * React hook for WebSocket connection management.
 *
 * Provides auto-connect on mount, auto-reconnect with exponential backoff,
 * JWT authentication, message handler registry, and React Query integration
 * for automatic cache invalidation on file/folder events.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth";

/** WebSocket connection status. */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

/** Incoming message from the server. */
export interface WSMessage {
  type: string;
  data?: Record<string, unknown>;
  status?: string;
  message?: string;
}

/** Handler function for a specific message type. */
type MessageHandler = (data: Record<string, unknown>) => void;

/** Base URL for the WebSocket endpoint. */
function getWsUrl(): string {
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  return apiUrl.replace(/^http/, "ws") + "/ws";
}

/**
 * React hook for WebSocket connection management.
 *
 * Features:
 * - Connects automatically on mount when the user is authenticated.
 * - Sends an ``auth`` message with the JWT token immediately on open.
 * - Registers message handlers for specific event types.
 * - Exponential backoff reconnect (1s, 2s, 4s, 8s, max 30s).
 * - Integrates with React Query: invalidates ``folderContents`` queries
 *   on file/folder change events.
 * - Responds to server pings with pongs.
 *
 * @returns An object with the current connection status and a function to
 *   send messages to the server.
 */
export function useWebSocket(): {
  status: ConnectionStatus;
  send: (message: Record<string, unknown>) => void;
  on: (type: string, handler: MessageHandler) => () => void;
} {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const queryClient = useQueryClient();

  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /**
   * Register a handler for a specific message type.
   * Returns an unsubscribe function.
   */
  const on = useCallback(
    (type: string, handler: MessageHandler): (() => void) => {
      let handlers = handlersRef.current.get(type);
      if (!handlers) {
        handlers = new Set();
        handlersRef.current.set(type, handlers);
      }
      handlers.add(handler);

      return () => {
        handlers!.delete(handler);
        if (handlers!.size === 0) {
          handlersRef.current.delete(type);
        }
      };
    },
    [],
  );

  /** Dispatch a message to registered handlers. */
  const dispatch = useCallback((msg: WSMessage) => {
    const handlers = handlersRef.current.get(msg.type);
    if (handlers && msg.data) {
      for (const handler of handlers) {
        try {
          handler(msg.data);
        } catch (err) {
          console.error(`[WS] Handler error for type=${msg.type}:`, err);
        }
      }
    }
  }, []);

  /** Invalidate React Query caches for file/folder changes. */
  const invalidateOnEvent = useCallback(
    (msg: WSMessage) => {
      const invalidateTypes = [
        "file.uploaded",
        "file.deleted",
        "file.renamed",
        "folder.updated",
      ];
      if (invalidateTypes.includes(msg.type)) {
        void queryClient.invalidateQueries({ queryKey: ["folderContents"] });
      }
    },
    [queryClient],
  );

  /** Send a JSON message to the server. */
  const send = useCallback((message: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  /** Connect to the WebSocket server. */
  const connect = useCallback(() => {
    if (!isAuthenticated || !accessToken) {
      return;
    }

    // Prevent duplicate connections
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setStatus("connecting");

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      // Send auth message as the first message
      ws.send(JSON.stringify({ type: "auth", token: accessToken }));
      backoffRef.current = 1000;
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg: WSMessage = JSON.parse(event.data as string);

        // Handle auth response
        if (msg.type === "auth" && msg.status === "ok") {
          setStatus("connected");
          return;
        }

        // Respond to server pings
        if (msg.type === "ping") {
          send({ type: "pong" });
          return;
        }

        // Dispatch to registered handlers
        dispatch(msg);

        // Invalidate React Query caches on file/folder events
        invalidateOnEvent(msg);
      } catch (err) {
        console.error("[WS] Failed to parse message:", err);
      }
    };

    ws.onclose = (event: CloseEvent) => {
      setStatus("disconnected");
      wsRef.current = null;

      // Don't reconnect on auth failure (4001) or if not authenticated
      if (event.code === 4001 || !isAuthenticated) {
        return;
      }

      // Exponential backoff reconnect
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, 30_000);

      reconnectTimerRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    ws.onerror = () => {
      // onerror is always followed by onclose, so reconnect is handled there
    };
  }, [isAuthenticated, accessToken, send, dispatch, invalidateOnEvent]);

  /** Disconnect and clean up. */
  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("disconnected");
  }, []);

  // Connect on mount when authenticated
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, accessToken, connect, disconnect]);

  // Reconnect when auth state changes
  useEffect(() => {
    if (!isAuthenticated) {
      disconnect();
    }
  }, [isAuthenticated, disconnect]);

  return { status, send, on };
}
