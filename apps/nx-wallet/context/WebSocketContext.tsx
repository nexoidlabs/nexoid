/**
 * WebSocketContext -- DEMO STUB
 *
 * No WebSocket backend for the hackathon demo.
 * Provides the same context shape so consumers compile, but
 * isConnected is always false and connect/disconnect are no-ops.
 */

import React, { createContext, useContext } from 'react';

interface WebSocketEvent {
  type: string;
  conversation_id: string;
  timestamp: number;
}

interface WebSocketContextType {
  isConnected: boolean;
  connect: (userId: string) => void;
  disconnect: () => void;
  lastEvent: WebSocketEvent | null;
  addEventListener: (listener: (event: WebSocketEvent) => void) => void;
  removeEventListener: (listener: (event: WebSocketEvent) => void) => void;
  addConnectionListener: (listener: (isConnected: boolean) => void) => void;
  removeConnectionListener: (listener: (isConnected: boolean) => void) => void;
}

const noop = () => {};

const stubValue: WebSocketContextType = {
  isConnected: false,
  connect: noop,
  disconnect: noop,
  lastEvent: null,
  addEventListener: noop,
  removeEventListener: noop,
  addConnectionListener: noop,
  removeConnectionListener: noop,
};

const WebSocketContext = createContext<WebSocketContextType>(stubValue);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketContext.Provider value={stubValue}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WebSocketContext);
}
