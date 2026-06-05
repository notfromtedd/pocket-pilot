# Drone Dispatch

AI-powered drone delivery dispatch system for Nairobi. Dual interface — customer shop with live order tracking, and an admin command center with 3D flight visualization.

---

## What It Does

**Customers** browse a product catalog, place orders (or trigger emergency voice dispatch), and track their drone live on a map.

**Operators** manage the ticket queue, assign drones from a 5-unit fleet, run the AI flight planner to generate safe routes around Nairobi airspace, and monitor real-time telemetry.

---

## Key Features

- **AI flight planner** — Claude (or Gemini fallback) generates waypoint routes from any drone base to any Nairobi destination, reasoning around airspace hazards (CBD towers, JKIA corridor, embassy zones, etc.) specific to that route's bearing
- **Emergency voice dispatch** — speech recognition feeds a transcript to AI, which matches it to inventory and auto-creates a prioritized ticket with coordinates
- **Real-time fleet telemetry** — Supabase Realtime pushes drone position, altitude, battery, and flight phase at 250ms intervals
- **3D FPV map** — Mapbox GL + Three.js renders a live drone model flying the planned route over Nairobi terrain
- **SMS proximity alerts** — Africa's Talking / Twilio sends the customer an SMS when the drone is within 150m of their location
- **Order system** — cart, checkout, order history, and admin product/revenue management

---

## Fleet

| ID | Name | Model | Base | Max Payload |
|----|------|-------|------|-------------|
| DRN-402 | KICC Alpha | AeroMed X4 | CBD (-1.2921, 36.8219) | 4.5 kg |
| DRN-417 | Upperhill Beta | AeroMed X4 | Upperhill (-1.3007, 36.8155) | 4.5 kg |
| DRN-431 | Westlands Gamma | AeroMed Scout | Westlands (-1.2645, 36.8026) | 3.2 kg |
| DRN-448 | Industrial Delta | AeroMed Cargo | Industrial Area (-1.3141, 36.8499) | 6.0 kg |
| DRN-463 | Langata Echo | AeroMed X4 | Langata (-1.3521, 36.7544) | 4.5 kg |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + TypeScript |
| AI | Anthropic Claude `claude-sonnet-4-6` (primary), Google Gemini 2.0 Flash (fallback) |
| Database / Auth / Realtime | Supabase |
| Maps | Mapbox GL JS 3D |
| 3D Visualization | Three.js + React Three Fiber |
| SMS | Africa's Talking / Twilio (auto-fallback chain) |
| Styling | Tailwind CSS 4 |

---

## Project Structure

```
drone-dispatch/
├── app/
│   ├── page.tsx                  # Landing page
│   ├── auth/                     # Email OTP authentication
│   ├── customer/                 # Customer shop, cart, order tracking
│   ├── admin/                    # Operator command center
│   ├── api/
│   │   ├── dispatch/             # AI text → ticket extraction
│   │   ├── emergency-voice/      # AI voice transcript → order + ticket
│   │   ├── missions/
│   │   │   ├── plan-route/       # AI waypoint + altitude planner
│   │   │   └── command/          # Drone command handler (launch, hold, RTB…)
│   │   ├── orders/               # Order CRUD
│   │   ├── products/             # Product CRUD
│   │   └── send-sms/             # SMS proximity notification
│   ├── components/
│   │   ├── FPVMap.tsx            # 3D Mapbox drone visualizer
│   │   ├── EmergencyPanel.tsx    # Voice capture UI
│   │   ├── ProductGrid.tsx       # Shop grid
│   │   ├── CartDrawer.tsx        # Cart / checkout
│   │   └── ...
│   └── lib/
│       ├── fleet.ts              # Drone fleet definitions
│       ├── simulator.ts          # Flight physics & path interpolation
│       └── ai-client.ts          # Anthropic + Gemini wrapper
```

---

## Setup

### 1. Install dependencies
```bash
cd drone-dispatch
npm install
```

### 2. Environment variables

Create `drone-dispatch/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Mapbox
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=

# AI (default: anthropic)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=
# GOOGLE_AI_API_KEY=      # only needed if AI_PROVIDER=gemini

# SMS (default: auto — tries Africa's Talking, then Twilio, then mock)
SMS_PROVIDER=auto
AT_API_KEY=
AT_USERNAME=
AT_ENV=sandbox
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_PHONE=
```

### 3. Run
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Current Status

- [x] Customer portal — shop, cart, checkout, order tracking
- [x] Admin command center — dispatch queue, 3D FPV map, telemetry
- [x] AI flight planner — per-drone origin, bearing-aware hazard routing
- [x] Emergency voice dispatch
- [x] Real-time fleet telemetry (Supabase Realtime)
- [x] SMS proximity alerts
- [x] 5-drone fleet with distinct home bases
- [x] Revenue and product management panels

---

## Team

- Teddy Ngugi Nderitu
- Cyril Baraka
