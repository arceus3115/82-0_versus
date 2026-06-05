import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine } from "../game/engine";
import type { ClientMessage, GameMode, LobbyState } from "../game/types";
import { GameConnection } from "../network/connection";

export function useGame() {
  const [state, setState] = useState<LobbyState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState("");

  const connectionRef = useRef<GameConnection | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const syncState = useCallback((next: LobbyState) => {
    setState(next);
    connectionRef.current?.broadcastState(next);
  }, []);

  useEffect(() => {
    const onHostMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ senderId: string; message: ClientMessage }>).detail;
      const engine = engineRef.current;
      if (!engine) return;

      if (detail.message.type === "join") {
        engine.addPlayer(detail.senderId, detail.message.name);
        return;
      }

      engine.handleMessage(detail.senderId, detail.message);
    };

    window.addEventListener("host-message", onHostMessage);
    return () => window.removeEventListener("host-message", onHostMessage);
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      connectionRef.current?.destroy();
    };
  }, []);

  const createLobby = async (displayName: string) => {
    setConnecting(true);
    setError(null);
    setName(displayName);
    try {
      const conn = new GameConnection({
        onState: setState,
        onAssigned: (id, host) => {
          setPlayerId(id);
          setIsHost(host);
        },
        onError: setError,
        onPeerDisconnected: (id) => engineRef.current?.removePlayer(id),
      });
      connectionRef.current = conn;

      const { code, playerId: hostId } = await conn.createLobby();
      const engine = new GameEngine(hostId, displayName, syncState);
      engineRef.current = engine;
      engine.state.code = code;
      setPlayerId(hostId);
      setIsHost(true);
      setState(engine.getState());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lobby");
    } finally {
      setConnecting(false);
    }
  };

  const joinLobby = async (code: string, displayName: string) => {
    setConnecting(true);
    setError(null);
    setName(displayName);
    try {
      const conn = new GameConnection({
        onState: setState,
        onAssigned: (id, host) => {
          setPlayerId(id);
          setIsHost(host);
        },
        onError: setError,
      });
      connectionRef.current = conn;
      await conn.joinLobby(code, displayName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join lobby");
    } finally {
      setConnecting(false);
    }
  };

  const send = (message: ClientMessage) => {
    connectionRef.current?.send(message);
  };

  const setReady = () => send({ type: "ready" });
  const startGame = (mode: GameMode) => send({ type: "start", mode });
  const pickCard = (cardId: string) => send({ type: "pick", cardId });
  const mulliganFull = () => send({ type: "mulligan_full" });
  const mulliganYear = (playerName: string) => send({ type: "mulligan_year", playerName });
  const mulliganSkip = () => send({ type: "mulligan_skip" });
  const simulateRound = () => send({ type: "simulate_round" });

  return {
    state,
    playerId,
    isHost,
    error,
    connecting,
    name,
    createLobby,
    joinLobby,
    setReady,
    startGame,
    pickCard,
    mulliganFull,
    mulliganYear,
    mulliganSkip,
    simulateRound,
  };
}
