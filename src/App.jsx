import { useEffect, useState, useRef } from "react";
import SockJS from "sockjs-client";
import { Client } from "@stomp/stompjs";
import { playSound } from "./utils/sounds";

function App() {
  const [elevators, setElevators] = useState([
    {
      elevatorId: 1,
      currentFloor: 0,
      movementState: "IDLE",
      doorState: "CLOSED",
      mode: "NORMAL",
      capacity: 10,
    },
    {
      elevatorId: 2,
      currentFloor: 0,
      movementState: "IDLE",
      doorState: "CLOSED",
      mode: "NORMAL",
      capacity: 10,
    },
  ]);

  const [requestedFloors, setRequestedFloors] = useState([]);

  const [connected, setConnected] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [activePanel, setActivePanel] = useState("call");
  const [showAdmin, setShowAdmin] = useState(false);
  const stompClientRef = useRef(null);
  const [time, setTime] = useState(new Date());

  // Time update
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket connection
  useEffect(() => {
    let stompClient;

    try {
      const socket = new SockJS("https://elevator-system-qo4e.onrender.com/ws");

      stompClient = new Client({
        webSocketFactory: () => socket,
        reconnectDelay: 5000,
        onConnect: () => {
          console.log("✅ Connected to WebSocket");
          setConnected(true);

          stompClient.subscribe("/topic/elevators", (message) => {
            try {
              const data = JSON.parse(message.body);

              // Play sounds on state changes
              setElevators((prevElevators) => {
                data.forEach((newElev, index) => {
                  const oldElev = prevElevators[index];

                  if (oldElev) {
                    // Ding when elevator arrives
                    if (
                      oldElev.movementState !== "IDLE" &&
                      newElev.movementState === "IDLE"
                    ) {
                      playSound("ding");
                    }

                    // Door sounds
                    if (oldElev.doorState !== newElev.doorState) {
                      if (newElev.doorState === "OPEN") {
                        playSound("doorOpen");
                      } else if (newElev.doorState === "CLOSED") {
                        playSound("doorClose");
                      }
                    }
                  }
                });

                // Turn off floor lights when arrived
                data.forEach((newElev) => {
                  if (newElev.movementState === "IDLE") {
                    setRequestedFloors((prev) =>
                      prev.filter((floor) => floor !== newElev.currentFloor),
                    );
                  }
                });

                return data; // Return the new elevator data
              });
            } catch (e) {
              console.error("Error parsing message:", e);
            }
          });
        },
        onStompError: (frame) => {
          console.error("STOMP error:", frame);
          setConnected(false);
        },
        onWebSocketClose: () => {
          setConnected(false);
        },
      });

      stompClient.activate();
      stompClientRef.current = stompClient;
    } catch (e) {
      console.error("Failed to connect:", e);
    }

    return () => {
      if (stompClient) {
        stompClient.deactivate();
      }
    };
  }, []);

  // Call elevator
  const callElevator = (targetFloor, direction) => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }
    setRequestedFloors((prev) => {
      if (!prev.includes(targetFloor)) {
        return [...prev, targetFloor];
      }
      return prev;
    });

    const request = {
      targetFloor: targetFloor,
      direction: direction,
      timestamp: new Date().toISOString(),
    };

    try {
      stompClientRef.current.publish({
        destination: "/app/elevator/call",
        body: JSON.stringify(request),
      });
      playSound("click");
      console.log(
        `✅ Elevator called to floor ${targetFloor} going ${direction}`,
      );
    } catch (e) {
      console.error("❌ Failed to send request:", e);
    }
  };

  // Direct control
  const sendElevatorToFloor = (elevatorId, targetFloor) => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }

    const request = {
      elevatorId: elevatorId,
      targetFloor: targetFloor,
      timestamp: new Date().toISOString(),
    };

    try {
      stompClientRef.current.publish({
        destination: "/app/elevator/goto",
        body: JSON.stringify(request),
      });
      playSound("click");
      console.log(`✅ Elevator ${elevatorId} sent to floor ${targetFloor}`);
    } catch (e) {
      console.error("❌ Failed to send request:", e);
    }
  };

  // Emergency/Fire alarm for all elevators
  const triggerFireAlarm = () => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }

    if (confirm("🚨 Activate FIRE EMERGENCY for all elevators?")) {
      elevators.forEach((e) => {
        fetch(
          `https://elevator-system-qo4e.onrender.com/api/elevator/emergency?elevatorId=${e.elevatorId}`,
          {
            method: "POST",
          },
        ).catch((err) => console.error("Emergency request failed:", err));
      });
      playSound("alarm");
      console.log("🚨 FIRE EMERGENCY ACTIVATED");
    }
  };

  // Individual elevator emergency
  const triggerEmergency = (elevatorId) => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }

    fetch(
      `https://elevator-system-qo4e.onrender.com/api/elevator/emergency?elevatorId=${elevatorId}`,
      {
        method: "POST",
      },
    )
      .then(() => {
        playSound("alarm");
        console.log(`🚨 Emergency triggered for Elevator ${elevatorId}`);
      })
      .catch((err) => console.error("Emergency request failed:", err));
  };

  const clearEmergency = (elevatorId) => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }

    fetch(
      `https://elevator-system-qo4e.onrender.com/api/elevator/clearEmergency?elevatorId=${elevatorId}`,
      {
        method: "POST",
      },
    )
      .then(() => {
        console.log(`✅ Emergency cleared for Elevator ${elevatorId}`);
      })
      .catch((err) => console.error("Clear emergency failed:", err));
  };

  // Maintenance toggle
  const toggleMaintenance = (elevatorId, enable) => {
    if (!connected) {
      alert("⚠️ Backend not connected!");
      return;
    }

    fetch(
      `https://elevator-system-qo4e.onrender.com/api/elevator/maintenance?elevatorId=${elevatorId}&enable=${enable}`,
      {
        method: "POST",
      },
    )
      .then(() => {
        console.log(
          `🔧 Elevator ${elevatorId} maintenance: ${enable ? "ON" : "OFF"}`,
        );
      })
      .catch((err) => console.error("Maintenance request failed:", err));
  };

  const TOTAL_FLOORS = 10;

  return (
    <div className="app-container">
      <div className="background-gradient"></div>
      <div className="background-pattern"></div>

      <div className="content-wrapper">
        {/* Header */}
        <header className="header-bar">
          <div className="header-left">
            <div className="building-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <rect
                  x="6"
                  y="2"
                  width="12"
                  height="20"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <line
                  x1="9"
                  y1="5"
                  x2="9"
                  y2="5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="12"
                  y1="5"
                  x2="12"
                  y2="5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="15"
                  y1="5"
                  x2="15"
                  y2="5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <rect x="10" y="16" width="4" height="6" fill="currentColor" />
              </svg>
            </div>
            <div className="header-text">
              <h1 className="building-name">Premium Tower</h1>
              <p className="building-subtitle">Elevator Control System</p>
            </div>
          </div>

          <div className="header-right">
            <div className="time-display">
              <div className="time">
                {time.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              <div className="date">
                {time.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
            <div
              className={`status-indicator ${connected ? "online" : "offline"}`}
            >
              <div className="status-dot"></div>
              <span>{connected ? "System Online" : "Offline"}</span>
            </div>
          </div>
        </header>

        {!connected && (
          <div className="demo-banner">
            <div className="demo-icon">⚠️</div>
            <div className="demo-text">
              <strong>Backend Not Connected</strong>
              <span>Start your Spring Boot backend on port 8080</span>
            </div>
          </div>
        )}

        {/* Admin Panel Toggle */}
        <div className="admin-toggle">
          <button
            onClick={() => setShowAdmin(!showAdmin)}
            className={`admin-toggle-btn ${showAdmin ? "active" : ""}`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
            </svg>
            {showAdmin ? "Close Admin Panel" : "Admin Panel"}
          </button>
        </div>

        {/* Admin Panel */}
        {showAdmin && (
          <div className="admin-panel">
            <h2 className="admin-title">🛡️ Admin Control Panel</h2>

            <div className="admin-grid">
              {/* Fire Alarm */}
              <div className="admin-card fire-alarm-card">
                <h3 className="card-title">
                  <span className="card-icon">🚨</span>
                  Fire Emergency
                </h3>
                <button
                  onClick={triggerFireAlarm}
                  disabled={!connected}
                  className="fire-alarm-btn"
                >
                  <span className="alarm-icon">🔥</span>
                  <span>ACTIVATE FIRE ALARM</span>
                  <span className="alarm-desc">
                    All elevators to ground floor
                  </span>
                </button>
              </div>

              {/* Individual Elevator Controls */}
              {elevators.map((elevator) => (
                <div
                  key={elevator.elevatorId}
                  className="admin-card elevator-card"
                >
                  <h3 className="card-title">
                    <span className="card-icon">🛗</span>
                    Elevator {elevator.elevatorId}
                  </h3>

                  <div className="admin-elevator-status">
                    <div className="status-row">
                      <span className="status-label">Floor:</span>
                      <span className="status-value">
                        {elevator.currentFloor}
                      </span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">State:</span>
                      <span
                        className={`status-value ${elevator.movementState.toLowerCase()}`}
                      >
                        {elevator.movementState}
                      </span>
                    </div>
                    <div className="status-row">
                      <span className="status-label">Mode:</span>
                      <span
                        className={`status-badge ${elevator.mode.toLowerCase()}`}
                      >
                        {elevator.mode}
                      </span>
                    </div>
                  </div>

                  <div className="admin-controls">
                    <button
                      onClick={() => triggerEmergency(elevator.elevatorId)}
                      disabled={!connected || elevator.mode === "EMERGENCY"}
                      className="emergency-btn-small"
                    >
                      ⚠️ Emergency
                    </button>

                    <button
                      onClick={() => clearEmergency(elevator.elevatorId)}
                      disabled={!connected || elevator.mode !== "EMERGENCY"}
                      className="reset-btn"
                    >
                      ✅ Reset Emergency
                    </button>

                    <div className="maintenance-toggle">
                      <span className="toggle-label">Maintenance:</span>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={elevator.mode === "MAINTENANCE"}
                          onChange={(e) =>
                            toggleMaintenance(
                              elevator.elevatorId,
                              e.target.checked,
                            )
                          }
                          disabled={!connected || elevator.mode === "EMERGENCY"}
                        />
                        <span className="slider"></span>
                      </label>
                      <span className="toggle-status">
                        {elevator.mode === "MAINTENANCE" ? "ON" : "OFF"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🏢 LOBBY DISPLAY SCREEN */}
        <div className="lobby-display">
          <h2 className="lobby-title">LOBBY STATUS BOARD</h2>

          <div className="lobby-grid">
            {elevators.map((elevator) => (
              <div key={elevator.elevatorId} className="lobby-card">
                <div className="lobby-elevator-label">
                  🛗 Elevator {elevator.elevatorId}
                </div>

                <div className="lobby-floor-display">
                  <span className="digital-floor">
                    {elevator.currentFloor.toString().padStart(2, "0")}
                  </span>

                  <span className="direction-indicator">
                    {elevator.movementState === "MOVING_UP" && "⬆"}
                    {elevator.movementState === "MOVING_DOWN" && "⬇"}
                    {elevator.movementState === "IDLE" && "•"}
                  </span>
                </div>

                <div
                  className={`door-status ${elevator.doorState?.toLowerCase()}`}
                >
                  {elevator.doorState === "OPEN"
                    ? "Doors Open"
                    : "Doors Closed"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="main-grid">
          {/* Control Panel */}
          <div className="control-panel-wrapper">
            <div className="panel-tabs">
              <button
                className={`tab ${activePanel === "call" ? "active" : ""}`}
                onClick={() => setActivePanel("call")}
              >
                Call Elevator
              </button>
              <button
                className={`tab ${activePanel === "direct" ? "active" : ""}`}
                onClick={() => setActivePanel("direct")}
              >
                Direct Control
              </button>
            </div>

            {activePanel === "call" ? (
              <div className="panel-content">
                <h2 className="panel-title">Call Elevator</h2>
                <p className="panel-description">
                  Select your floor and direction
                </p>

                <div className="floor-grid">
                  {Array.from({ length: TOTAL_FLOORS + 1 }, (_, i) => {
                    const floor = TOTAL_FLOORS - i;
                    return (
                      <button
                        key={floor}
                        onClick={() => setSelectedFloor(floor)}
                        className={`floor-button ${selectedFloor === floor ? "selected" : ""}`}
                      >
                        <span className="floor-number">{floor}</span>
                        <span className="floor-label">
                          {floor === 0 ? "Lobby" : `Floor ${floor}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {selectedFloor !== null && (
                  <div className="direction-controls">
                    <button
                      onClick={() => callElevator(selectedFloor, "UP")}
                      disabled={selectedFloor === TOTAL_FLOORS || !connected}
                      className="direction-button up"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M12 5L19 12L17.59 13.41L13 8.83V19H11V8.83L6.41 13.41L5 12L12 5Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>Going Up</span>
                    </button>
                    <button
                      onClick={() => callElevator(selectedFloor, "DOWN")}
                      disabled={selectedFloor === 0 || !connected}
                      className="direction-button down"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M12 19L5 12L6.41 10.59L11 15.17V5H13V15.17L17.59 10.59L19 12L12 19Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>Going Down</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="panel-content">
                <h2 className="panel-title">Direct Control</h2>
                <p className="panel-description">
                  Send specific elevator to any floor
                </p>

                {elevators.map((elevator) => (
                  <div
                    key={elevator.elevatorId}
                    className="elevator-direct-control"
                  >
                    <div className="elevator-control-header">
                      <div className="elevator-info">
                        <span className="elevator-label">
                          Elevator {elevator.elevatorId}
                        </span>
                        <span
                          className={`elevator-status ${elevator.movementState.toLowerCase()}`}
                        >
                          {elevator.movementState === "IDLE"
                            ? "Available"
                            : "In Transit"}
                        </span>
                      </div>
                      <div className="current-floor-badge">
                        Floor {elevator.currentFloor}
                      </div>
                    </div>
                    <div className="floor-quick-grid">
                      {Array.from({ length: TOTAL_FLOORS + 1 }, (_, floor) => (
                        <button
                          key={floor}
                          onClick={() =>
                            sendElevatorToFloor(elevator.elevatorId, floor)
                          }
                          disabled={
                            elevator.currentFloor === floor || !connected
                          }
                          className={`quick-floor ${elevator.currentFloor === floor ? "current" : ""}`}
                        >
                          {floor}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visualization Panel */}
          <div className="visualization-panel">
            <h2 className="viz-title">Live Status</h2>

            <div className="elevators-display">
              {elevators.map((elevator) => (
                <div
                  key={elevator.elevatorId}
                  className="elevator-shaft-container"
                >
                  <div className="elevator-header-info">
                    <div className="elevator-id">
                      <span className="id-label">Elevator</span>
                      <span className="id-number">{elevator.elevatorId}</span>
                    </div>
                    <div
                      className={`mode-badge ${elevator.mode.toLowerCase()}`}
                    >
                      {elevator.mode}
                    </div>
                  </div>
                  <div className="elevator-shaft">
                    <div className="shaft-track"></div>
                    {Array.from({ length: TOTAL_FLOORS + 1 }, (_, i) => {
                      const floor = TOTAL_FLOORS - i;
                      const isCurrentFloor = elevator.currentFloor === floor;

                      return (
                        <div
                          key={floor}
                          className={`floor-row ${
                            requestedFloors.includes(floor)
                              ? "floor-active"
                              : ""
                          }`}
                        >
                          <div className="floor-indicator">
                            <span className="floor-num">{floor}</span>
                          </div>

                          {isCurrentFloor && (
                            <div
                              className={`elevator-car ${elevator.mode.toLowerCase()}`}
                            >
                              <div className="car-top">
                                <div className="car-indicator">
                                  {elevator.movementState === "MOVING_UP" && (
                                    <svg
                                      width="20"
                                      height="20"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M12 4l-8 8h16z" />
                                    </svg>
                                  )}
                                  {elevator.movementState === "MOVING_DOWN" && (
                                    <svg
                                      width="20"
                                      height="20"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M12 20l8-8H4z" />
                                    </svg>
                                  )}
                                  {elevator.movementState === "IDLE" && (
                                    <div className="idle-indicator"></div>
                                  )}
                                </div>
                              </div>
                              <div className="car-body">
                                {/* Door Animation */}
                                <div
                                  className={`elevator-doors ${elevator.doorState ? elevator.doorState.toLowerCase() : "closed"}`}
                                >
                                  <div className="door door-left">
                                    <div className="door-panel"></div>
                                  </div>
                                  <div className="door door-right">
                                    <div className="door-panel"></div>
                                  </div>
                                </div>

                                <div className="car-display">
                                  <div className="display-floor">
                                    {elevator.currentFloor}
                                  </div>
                                </div>
                                <div className="car-details">
                                  <div className="detail">
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                    >
                                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                    </svg>
                                    <span>
                                      {elevator.capacity || 8} persons
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="floor-line"></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
