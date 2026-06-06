import { useEffect, useState } from "react";
import { ConfirmScreen } from "./components/ConfirmScreen";
import { ConnectingOverlay } from "./components/ConnectingOverlay";
import { DraftScreen } from "./components/DraftScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { ResultsScreen } from "./components/ResultsScreen";
import { useGame } from "./hooks/useGame";
import type { ConnectionMode } from "./network/connection";

const DISPLAY_NAME_KEY = "versus-display-name";

type Screen = "home" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    import.meta.env.DEV ? "local" : "online",
  );

  const game = useGame();

  useEffect(() => {
    const saved = localStorage.getItem(DISPLAY_NAME_KEY);
    if (saved) setNameInput(saved);
  }, []);

  useEffect(() => {
    const trimmed = nameInput.trim();
    if (trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  }, [nameInput]);

  const enterGame = () => setScreen("game");

  const handleCreate = async () => {
    if (!nameInput.trim()) return;
    const ok = await game.createLobby(nameInput.trim(), connectionMode);
    if (ok) enterGame();
  };

  const handleJoin = async () => {
    if (!nameInput.trim() || !codeInput.trim()) return;
    const ok = await game.joinLobby(codeInput.trim(), nameInput.trim(), connectionMode);
    if (ok) enterGame();
  };

  const activeConnectionMode = game.connecting ? connectionMode : game.connectionMode;
  const showConnecting = game.connecting;
  const showSyncing = screen === "game" && !game.state && !game.connecting;

  if (showConnecting || showSyncing) {
    return (
      <ConnectingOverlay
        connectionMode={activeConnectionMode}
        phase={showSyncing ? "sync" : "connect"}
      />
    );
  }

  if (screen === "home" || !game.state) {
    return (
      <div className="app">
        <header className="topbar">
          <span className="logo">VERSUS</span>
          <span className="tag">NBA draft</span>
        </header>

        <main className="home">
          <section className="hero-card home-hero">
            <p className="eyebrow">Multiplayer draft</p>
            <h1>Draft NBA seasons. Build your five.</h1>
            <p className="subcopy">
              Snake draft, in-draft mulligans, then both players confirm for the result.
            </p>
          </section>

          <div className="panel home-form">
            {game.dataLoading && <p className="mode-hint">Loading player database…</p>}
            {game.dataError && <p className="error">{game.dataError}</p>}
            {game.dataReady && (
              <p className="mode-hint">
                {game.playerPool?.length.toLocaleString()} player-seasons loaded.
              </p>
            )}

            <label>
              Connection mode
              <select
                value={connectionMode}
                onChange={(e) => setConnectionMode(e.target.value as ConnectionMode)}
              >
                <option value="local">Local testing (two tabs)</option>
                <option value="online">Online (PeerJS)</option>
              </select>
            </label>

            <label>
              Display name
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Kenny"
                maxLength={20}
              />
            </label>

            <div className="home-form-host">
              <button
                className="btn btn-primary btn-block"
                disabled={game.connecting || !game.dataReady || !nameInput.trim()}
                onClick={handleCreate}
              >
                Create lobby (host)
              </button>
            </div>

            <div className="home-form-divider" aria-hidden>
              <span>or join</span>
            </div>

            <div className="home-form-join">
              <label>
                Join code
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                />
              </label>
              <button
                className="btn btn-secondary btn-block"
                disabled={
                  game.connecting ||
                  !game.dataReady ||
                  !nameInput.trim() ||
                  codeInput.length < 4
                }
                onClick={handleJoin}
              >
                Join lobby
              </button>
            </div>

            {game.error && <p className="error">{game.error}</p>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app app--wide">
      <header className="topbar">
        <span className="logo">VERSUS</span>
        <span className="tag">
          {game.state.code} · {game.connectionMode === "local" ? "Local" : "Online"}
        </span>
      </header>

      <main>
        {game.state.phase === "waiting" && (
          <LobbyScreen
            state={game.state}
            playerId={game.playerId}
            isHost={game.isHost}
            onReady={game.setReady}
            onStart={game.startGame}
          />
        )}
        {game.state.phase === "drafting" && (
          <DraftScreen
            state={game.state}
            playerId={game.playerId}
            onPick={game.pickCard}
            onMulliganFull={game.mulliganFull}
            onMulliganYear={game.mulliganYear}
            onSwap={game.swapPositions}
          />
        )}
        {game.state.phase === "confirming" && (
          <ConfirmScreen
            state={game.state}
            playerId={game.playerId}
            onConfirm={game.confirmLineup}
            onSwap={game.swapPositions}
          />
        )}
        {game.state.phase === "finished" && (
          <ResultsScreen state={game.state} onPlayAgain={game.playAgain} />
        )}
      </main>
    </div>
  );
}
