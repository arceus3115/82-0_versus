import { useState } from "react";
import { DraftScreen } from "./components/DraftScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { MulliganScreen } from "./components/MulliganScreen";
import { ResultsScreen } from "./components/ResultsScreen";
import { SimulationScreen } from "./components/SimulationScreen";
import { useGame } from "./hooks/useGame";

type Screen = "home" | "game";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");

  const game = useGame();

  const enterGame = () => setScreen("game");

  const handleCreate = async () => {
    if (!nameInput.trim()) return;
    await game.createLobby(nameInput.trim());
    enterGame();
  };

  const handleJoin = async () => {
    if (!nameInput.trim() || !codeInput.trim()) return;
    await game.joinLobby(codeInput.trim(), nameInput.trim());
    enterGame();
  };

  if (screen === "home" || !game.state) {
    return (
      <div className="app">
        <header className="topbar">
          <span className="logo">VERSUS</span>
          <span className="tag">82–0 draft + streak</span>
        </header>

        <main className="home">
          <section className="hero-card home-hero">
            <p className="eyebrow">Multiplayer prototype</p>
            <h1>Draft NBA seasons. Survive the streak.</h1>
            <p className="subcopy">
              Host creates a lobby, friends join with a code. Snake draft, mulligans, then
              synchronized RNG rounds — static app, no backend required.
            </p>
          </section>

          <div className="panel home-form">
            <label>
              Display name
              <input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Kenny"
                maxLength={20}
              />
            </label>

            <div className="home-actions">
              <button
                className="btn btn-primary"
                disabled={game.connecting || !nameInput.trim()}
                onClick={handleCreate}
              >
                Create lobby (host)
              </button>
            </div>

            <div className="join-row">
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
                className="btn btn-secondary"
                disabled={game.connecting || !nameInput.trim() || codeInput.length < 4}
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
    <div className="app">
      <header className="topbar">
        <span className="logo">VERSUS</span>
        <span className="tag">Code {game.state.code}</span>
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
          />
        )}
        {game.state.phase === "mulligan" && (
          <MulliganScreen
            state={game.state}
            playerId={game.playerId}
            onFull={game.mulliganFull}
            onYear={game.mulliganYear}
            onSkip={game.mulliganSkip}
          />
        )}
        {game.state.phase === "simulating" && (
          <SimulationScreen
            state={game.state}
            playerId={game.playerId}
            isHost={game.isHost}
            onSimulate={game.simulateRound}
          />
        )}
        {game.state.phase === "finished" && <ResultsScreen state={game.state} />}
      </main>
    </div>
  );
}
