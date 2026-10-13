# SHERM REST API & Integration Specification
### Smart Hospital Emergency Resource Manager (SHERM)

This document provides complete documentation for the RESTful endpoints, Server-Sent Events (SSE) channels, input validation criteria, and error handling mechanisms implemented in SHERM.

---

## 1. Global Request / Response Standards

- **Base URL**: `http://localhost:3000/api`
- **Content Type**: `application/json; charset=utf-8`
- **Standard Success Response**:
  ```json
  {
    "success": true,
    "message": "Human readable confirmation string",
    "data": { ... }
  }
  ```
- **Standard Error Response**:
  ```json
  {
    "success": false,
    "error": "Descriptive error message",
    "code": "ERROR_CODE_STRING",
    "timestamp": "2026-10-13T18:15:00.000Z"
  }
  ```
- **Common HTTP Status Codes**:
  - `200 OK`: Request processed successfully.
  - `201 Created`: Resource successfully registered.
  - `400 Bad Request`: Validation failure or malformed payload.
  - `401 Unauthorized`: Session authentication missing or invalid.
  - `403 Forbidden`: User role lacks required operational permission.
  - `404 Not Found`: Target entity not found in database.
  - `409 Conflict`: Resource contention or race condition (e.g. bed occupied, doctor at capacity).
  - `429 Too Many Requests`: Rate limiter triggered.

---

## 2. Authentication APIs

### `POST /api/auth/login`
Authenticates hospital staff via bcrypt password verification.

- **Request Body**:
  ```json
  {
    "username": "coordinator",
    "password": "coord123"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "user": {
      "id": 2,
      "username": "coordinator",
      "fullName": "Coord. Angela Sterling",
      "role": "coordinator"
    }
  }
  ```

### `POST /api/auth/logout`
Destroys the server-side session and clears the session cookie.

### `GET /api/auth/me`
Returns the active session user or `{ "authenticated": false }`.

---

## 3. Real-Time Dashboard APIs

### `GET /api/dashboard/summary`
Returns high-level aggregate resource counters and active shortage alerts.

- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "cases": {
        "totalActive": 12,
        "criticalActive": 4,
        "awaitingAllocation": 3
      },
      "beds": {
        "total": 24,
        "available": 15,
        "occupied": 6,
        "outOfService": 3,
        "occupancyRate": 25
      },
      "doctors": {
        "total": 10,
        "available": 6,
        "busy": 1,
        "offDuty": 3
      },
      "ambulances": {
        "total": 6,
        "available": 3,
        "dispatched": 1,
        "enRoute": 1,
        "atHospital": 0,
        "outOfService": 1
      },
      "shortages": [],
      "lastUpdated": "2026-10-13T18:15:00.000Z"
    }
  }
  ```

### `GET /api/dashboard/charts`
Aggregates relational data specifically for Chart.js canvases:
- `bedsByWard`: Stacked bed status counts by care ward.
- `doctorSpecialties`: Active caseload vs. max limit capacity by specialty.
- `ambulanceStatus`: Fleet vehicle status distribution.
- `casesByPriority`: Case count grouped by administrative priority score.

### `GET /api/dashboard/urgent-queue`
Returns active cases prioritized by priority score (`Critical: 100`, `High: 75`) and arrival timestamp.

### `GET /api/dashboard/stream` (Server-Sent Events)
Live event stream pushing instant updates when resources change:
- `connected`: Handshake event with client counter.
- `ping`: Keep-alive ping sent every 25 seconds.
- `case:created`: Pushed when a new emergency case is registered.
- `case:updated`: Pushed when a case status or care area is edited.
- `case:closed`: Pushed when a patient is discharged.
- `allocation:confirmed`: Pushed when resources are atomically assigned.
- `bed:updated`: Pushed when bed status toggles.
- `ambulance:updated`: Pushed when a vehicle advances status or updates coordinates.
- `dashboard:refresh`: Generic refresh trigger.

---

## 4. Emergency Case Management APIs

### `GET /api/cases`
Queries emergency cases with multi-column filtering, search, and pagination.

- **Query Parameters**:
  - `search` (string): Searches case number, patient ref, and operational notes.
  - `priority` (string): Filter by `Critical`, `High`, `Medium`, `Low`.
  - `status` (string): Filter by `New`, `Triage`, `Allocated`, `In Treatment`, `Closed`.
  - `care_area` (string): Filter by ward name.
  - `page` (number): Default `1`.
  - `limit` (number): Default `15`.
  - `sortBy` (string): `priority_score` or `arrival_time`.

### `POST /api/cases`
Registers a new incoming emergency case.
*Permissions: Coordinator, Admin*

- **Request Body**:
  ```json
  {
    "case_number": "CAS-2026-8812",
    "patient_ref": "PT-4491-X",
    "age": 52,
    "arrival_time": "2026-10-13 22:30:00",
    "category": "Cardiovascular",
    "priority": "Critical",
    "care_area": "ICU",
    "specialty_needed": "Cardiology",
    "transport_needed": true,
    "operational_notes": "Simulated acute chest pain evaluation."
  }
  ```

### `POST /api/cases/:id/close`
Closes and discharges an active case. Releases the assigned bed back to Available, decrements physician caseload, and releases the ambulance.

---

## 5. Transparent Allocation Recommendation Engine

### `POST /api/allocations/recommend`
Evaluates multi-criteria compatibility and generates explainability rationale.

- **Request Body**:
  ```json
  {
    "caseId": 11
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "case": {
        "id": 11,
        "case_number": "CAS-2026-011",
        "priority": "Critical",
        "priority_score": 100,
        "care_area": "ICU"
      },
      "recommendations": {
        "bed": {
          "resource": { "id": 15, "bed_number": "ICU-03", "ward": "ICU" },
          "isAvailable": true,
          "rationale": "Bed ICU-03 (ICU - Critical Care) is available and exactly matches requested care area \"ICU\"."
        },
        "doctor": {
          "resource": { "id": 3, "name": "Dr. Elena Rostova", "specialty": "Cardiology" },
          "isAvailable": true,
          "rationale": "Dr. Elena Rostova (Cardiology) is on duty and available with current workload 1/4, matching specialty \"Cardiology\"."
        },
        "ambulance": {
          "resource": { "id": 1, "call_sign": "MEDIC-101", "capability": "Advanced Life Support" },
          "isNeeded": true,
          "isAvailable": true,
          "rationale": "Ambulance MEDIC-101 (Advanced Life Support) is available at station \"Metro Base Station (Simulated)\" for rapid dispatch."
        }
      },
      "isFullyFeasible": true,
      "disclaimer": "Administrative resource matching recommendation only. Final assignment requires verification and authorization by an emergency coordinator."
    }
  }
  ```

### `POST /api/allocations/confirm`
Atomically commits resource reservation within a SQLite transaction.
*Permissions: Coordinator, Admin*

- **Request Body**:
  ```json
  {
    "caseId": 11,
    "bedId": 15,
    "doctorId": 3,
    "ambulanceId": 1,
    "notes": "Verified telemetry and attending coverage."
  }
  ```
- **Failure on Race Condition (`409 Conflict`)**:
  ```json
  {
    "success": false,
    "error": "Conflict: Bed ICU-03 was occupied by another case just now. Please select another bed."
  }
  ```

---

## 6. Asset Fleet & Management APIs

### `GET /api/beds`
Returns beds along with ward categorization, occupancy state, and assigned patient references.

### `POST /api/beds/:id/release`
Releases an occupied bed back to Available.

### `GET /api/doctors`
Returns on-duty physicians with specialty, shift, and caseload limits.

### `POST /api/ambulances/:id/simulate-step`
Advances simulated transport status and updates coordinates:  
`Available` ➔ `Dispatched` ➔ `En Route` ➔ `At Hospital` ➔ `Available`.

---

## 7. Administrative Settings & Reset APIs

### `GET /api/settings/priorities`
Fetches configurable priority weights (`Critical`, `High`, `Medium`, `Low`).

### `PATCH /api/settings/priorities`
Allows administrators to adjust priority weights and display labels.
*Permissions: Admin*

### `POST /api/settings/reset-demo`
Restores the SQLite database to its baseline demonstration dataset.
*Permissions: Admin*
