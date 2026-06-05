# Customer Side Summary

## Overview
The customer side is a mobile-friendly delivery interface for Nairobi that combines product ordering, emergency voice dispatch, and live drone tracking. It is designed to make medical supply delivery faster, safer, and easier for customers who may be in urgent situations.

## Key Points

### 1. Prompting Design
- Uses a clear two-part prompt structure:
  - `systemPrompt` defines AI role, constraints, and output format.
  - `userPrompt` delivers the actual customer request and location data.
- Enforces structured AI responses using tool/function calling.
- Prompts include Nairobi-specific airspace and safety rules for route planning.
- Backend validates and sanitizes AI output before it affects operations.

### 2. Problem We Are Solving
- Customers in distress often cannot type clearly or provide structured information.
- Manual emergency ticket creation is slow and error-prone.
- Urban drone routing is complex and requires knowledge of local hazards.

### 3. Real-World Impact
- Converts spoken emergency requests into structured dispatch tickets quickly.
- Helps ensure the right medical payload is selected and prioritized correctly.
- Improves safety by planning routes that avoid risky Nairobi zones.
- Enables customers to track drones live, reducing uncertainty.

### 4. Scalability
- AI handles the hardest parts: request interpretation and route planning.
- Reduces dependence on human dispatchers for every ticket.
- Uses Supabase realtime channels for efficient live tracking.
- Provider-agnostic AI client allows switching models as traffic grows.

### 5. Depth of Claude Integration
- Claude is embedded in the core workflow for both:
  - Emergency request parsing
  - Flight route planning
- The model produces structured data that directly drives database records and drone missions.
- Claude is not just a chat assistant — it is the logic engine for the customer dispatch flow.
- The system includes strong guardrails, such as schema enforcement, coordinate validation, and altitude clamping.

## Customer Side Overview
The customer side is the front-facing experience for end users and judges. It combines a storefront for medical supplies, a voice-driven emergency dispatcher, and real-time drone tracking.

### What it is
- A mobile-first customer portal built in Next.js.
- Provides product browsing, cart checkout, and order submission.
- Includes a dedicated emergency panel for spoken requests.
- Connects directly to the drone delivery system through backend route handlers and Supabase.

### What it can do
- Browse and search medical products by category.
- Add items to cart, adjust quantities, and submit deliveries.
- Capture emergency requests by voice, transcribe them, and dispatch them quickly.
- Track active drone missions live: position, battery, speed, route, and status.

### How AI is integrated
- AI parses free-form emergency requests into structured ticket data.
- The dispatch flow uses Claude for intent extraction, payload identification, urgency scoring, and location confirmation.
- AI also assists in route planning by generating safe intermediate waypoints around Nairobi hazards.
- The product uses tool/function calling to force structured AI output, and the backend validates the results before action.

## Why This Matters
- Makes emergency delivery usable for customers in real situations.
- Increases speed and reliability of medical supply delivery.
- Offloads manual dispatcher work, enabling the system to scale.
- Keeps the customer experience simple while applying complex AI and geo logic behind the scenes.

