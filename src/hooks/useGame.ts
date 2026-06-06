import { useCallback, useEffect, useRef, useState } from "react";
import { GameEngine } from "../game/engine";
import { loadPlayerPool } from "../game/playerPool";
import type { ClientMessage, LobbyState, PlayerSeasonRaw } from "../game/types";
import { createConnection, type ConnectionMode } from "../network/connection";
import type { GameTransport } from "../network/types";

export function useGame() {
  const [state, setState] = useState<LobbyState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [name, setName] = useState("");
  const [playerPool, setPlayerPool] = useState<PlayerSeasonRaw[] | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const connectionRef = useRef<GameTransport | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    import.meta.env.DEV ? "local" : "online",
  );
  const engineRef = useRef<GameEngine | null>(null);
  const poolRef = useRef<PlayerSeasonRaw[] | null>(null);

  const syncState = useCallback((next: LobbyState) => {
    setState(next);
    connectionRef.current?.broadcastState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadPlayerPool()
      .then((pool) => {
        if (cancelled) return;
        poolRef.current = pool;
        setPlayerPool(pool);
        setDataLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err instanceof Error ? err.message : "Failed to load player data");
        setDataLoading(false);
      });
    return () => {
      cancelled = true;
    };
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

  const requirePool = () => {
    const pool = poolRef.current;
    if (!pool) throw new Error("Player data not loaded yet");
    return pool;
  };

  const createLobby = async (
    displayName: string,
    mode: ConnectionMode = connectionMode,
  ): Promise<boolean> => {
    setConnecting(true);
    setError(null);
    setName(displayName);
    setConnectionMode(mode);
    connectionRef.current?.destroy();
    engineRef.current?.destroy();
    engineRef.current = null;
    try {
      const pool = requirePool();
      const conn = createConnection(mode, {
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
      const engine = new GameEngine(hostId, displayName, pool, syncState);
      engineRef.current = engine;
      engine.state.code = code;
      setPlayerId(hostId);
      setIsHost(true);
      setState(engine.getState());
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lobby");
      return false;
    } finally {
      setConnecting(false);
    }
  };

  const joinLobby = async (
    code: string,
    displayName: string,
    mode: ConnectionMode = connectionMode,
  ): Promise<boolean> => {
    setConnecting(true);
    setError(null);
    setName(displayName);
    setConnectionMode(mode);
    connectionRef.current?.destroy();
    try {
      requirePool();
      const conn = createConnection(mode, {
        onState: setState,
        onAssigned: (id, host) => {
          setPlayerId(id);
          setIsHost(host);
        },
        onError: setError,
      });
      connectionRef.current = conn;
      const guestId = await conn.joinLobby(code, displayName);
      setPlayerId(guestId);
      setIsHost(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join lobby");
      return false;
    } finally {
      setConnecting(false);
    }
  };

  const send = (message: ClientMessage) => {
    connectionRef.current?.send(message);
  };

  const setReady = () => send({ type: "ready" });
  const startGame = () => send({ type: "start" });
  const pickCard = (cardId: string) => send({ type: "pick", cardId });
  const mulliganFull = () => send({ type: "mulligan_full" });
  const mulliganYear = (playerName: string) => send({ type: "mulligan_year", playerName });
  const confirmLineup = () => send({ type: "confirm" });
  const swapPositions = (fromIndex: number, toIndex: number) =>
    send({ type: "swap_positions", fromIndex, toIndex });
  const playAgain = () => send({ type: "play_again" });

  return {
    state,
    playerId,
    isHost,
    error,
    connecting,
    name,
    connectionMode,
    playerPool,
    dataLoading,
    dataError,
    dataReady: playerPool !== null,
    createLobby,
    joinLobby,
    setReady,
    startGame,
    pickCard,
    mulliganFull,
    mulliganYear,
    confirmLineup,
    swapPositions,
    playAgain,
  };
}
