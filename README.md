Gesture-Controlled Drone with AI Intent Recognition

Control a drone using Samsung phone gyroscope gestures, interpreted by Claude AI — no hardcoded if/else rules.

The Idea

Most gesture controllers use rigid rules like `if tilt > 20 degrees → move forward`.
Ours replaces that with Claude AI, which reads a window of gyro data and **reasons about intent**
— A slow sustained tilt means orbit.
-A violent shake means emergency stop.
-A quick double-snap means take a photo.

 How It Works

Samsung Phone (gyro data)
↓
Flask Bridge Server (Python)
↓
Claude API (AI intent recognition)
↓
MAVLink Protocol
↓
ArduPilot SITL / Real Drone

1. Samsung phone streams live gyroscope data over HTTP
2. Flask server buffers it into time windows
3. Claude analyzes the gesture pattern and returns a structured flight command
4. MAVLink sends the command to the drone (simulated or real)

Tech Stack

| Layer | Technology |
|-------|------------|
| Drone Simulator | ArduPilot SITL |
| Bridge Server | Python, Flask, pymavlink |
| AI Layer | Claude API (Anthropic) |
| Gesture Input | Samsung phone gyroscope |
| Dashboard | HTML/CSS/JavaScript |

📁 Project Structure
├── bridge/
│   └── bridge.py        # Flask server — receives gyro data, calls Claude, commands drone
├── simulator/
│   └── setup_notes.md   # ArduPilot SITL setup instructions
├── dashboard/
│   └── index.html       # Live UI — attitude, Claude reasoning log, gyro feed
└── docs/
└── architecture.md  # Full system design

Current Status

- [x] ArduPilot SITL environment configured
- [x] GPS lock, EKF3 active, STABILIZE mode confirmed
- [ ] Flask bridge server (in progress)
- [ ] Claude API integration
- [ ] Samsung gyro data pipeline
- [ ] Live dashboard

 Team

- Teddy Ngugi Nderitu
-Cyril Baraka

Why This Is Different

This is not a tutorial project. 
The Claude integration means the drone controller can handle gestures it was never explicitly programmed for — it understands **intent**, not just angles.
