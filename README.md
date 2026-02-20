# Attend-Me 📱🎓

<p align="center">
  <img src="assets/images/app%20logo.png" width="250" />
  <img src="assets/images/splash%20screen.jpg" width="250" />
</p>

A premier, enterprise-grade, offline-first React Native mobile application engineered specifically for educational institutions to automate and streamline attendance tracking using Bluetooth Low Energy (BLE) technology.

![React Native](https://img.shields.io/badge/react_native-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Expo](https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)

---

## 🚀 Comprehensive Feature Set & Technical Explanations

### 1. Automated BLE Beacon Scanning & Proximity Logic

<p align="center">
  <img src="assets/images/ble%20scanner%20screen.jpg" width="250" />
  <img src="assets/images/ble%20animation%20screen.jpg" width="250" />
  <img src="assets/images/beacon%20analyzer.jpg" width="250" />
</p>

The core of Attend-Me is its touchless attendance engine driven by Bluetooth Low Energy (BLE).

- **Foreground & Background Execution:** The app utilizes `react-native-ble-plx` for active scanning while open. To ensure no student is missed, it leverages `expo-location` and `expo-task-manager` to instantiate background threads that continue sniffing for securely broadcasted mobile IDs even when the device is locked.
- **Deduplication & Smart Queueing:** As beacons broadcast at high frequencies, the app employs a deduplication engine. A payload is processed once, the student is marked as "Present", and subsequent identical packets are dropped to save memory.
- **Time-Boundary Validation:** Scans are only accepted if they strictly align with the `start_time` and `end_time` bounds of a legitimately active `マスター_timetables` schedule slot.

### 2. Deep Offline-First Architecture & Optimistic Sync

<p align="center">
  <img src="assets/images/history%20screen%20with%20filter.jpg" width="250" />
  <img src="assets/images/history%20screen-calender.jpg" width="250" />
  <img src="assets/images/offline%C3%A8sync%20manager.jpg" width="250" />
</p>

Educational campuses often suffer from dead-zones. The app ensures absolutely zero data loss.

- **Persistent Local Caching:** The entire active timetable, roster lists, and pending notification queues are stored locally via `AsyncStorage`.
- **Optimistic UI:** When a faculty submits a Substitute Request or logs a student, the React state mutates instantly, giving the user immediate visual feedback (Optimistic Rendering).
- **Background Sync Queues:** A global `OfflineService` singleton intercepts all mutations. If `NetInfo` reports an offline state, the query is cached into a persistent array. Once connectivity restores, the service automatically flushes the queue to the Supabase backend in the background without user intervention.

### 3. Faculty Swap & Substitute Exchange Platforms

<p align="center">
  <img src="assets/images/sub&swap%20screen.jpg" width="250" />
</p>

A robust workflow for faculty to seamlessly hand-off class responsibilities.

- **Substitute Requests:** Faculty can select any upcoming class (even across multiple days) and directly request a peer within their specific Department (`profiles.dept`) to cover the slot.
- **Direct Time-Slot Swaps:** Faculty can browse peers teaching parallel sections and propose a direct 1:1 time "Swap". The UI explicitly maps "Take Class" parameters against "Give Class" parameters.
- **Conflict Prevention Engine:** Real-time database checks validate if the requested faculty already has a conflicting class scheduled at that exact `slot_id`.
- **Request Lifecycle:** Requests exist as `pending` and can transition organically to `accepted`, `declined`, or automatically flag as `expired` if the class start time passes without resolution.

### 4. Enterprise Leave Management & Constraints

<p align="center">
  <img src="assets/images/leave%20granter.jpg" width="250" />
  <img src="assets/images/od%20%20granter.jpg" width="250" />
  <img src="assets/images/od&leave%20%20manager.jpg" width="250" />
  <img src="assets/images/faculty%20leave.jpg" width="250" />
  <img src="assets/images/leaves%20status.jpg" width="250" />
</p>

Administrative constraints applied directly to the application environment.

- **End-to-End Tracking:** Faculty submit structured leave applications (Custom Notes, Start/End dates) that are securely inserted into a protected Supabase table.
- **Dashboard Suspension:** If an instructor's leave is "Approved", the app automatically forces their Dashboard into a suspended state. This computationally prevents them from generating false proxy attendance reports or mistakenly manipulating active class workflows.

### 5. Push Notifications & Contextual Action Badging

<p align="center">
  <img src="assets/images/notification%20screen.jpg" width="250" />
</p>

The notification system is modeled after priority-based enterprise inboxes.

- **Categorized Inboxes:** Native-style segmented routing categorizes pure "System Alerts" from actionable "Requests" and "Leave Status" updates.
- **Actionable Cards:** The UI strictly details the Originator, Target Department, Section String, and Slot ID. Faculty can "Accept" or "Decline" right from the notification card without context switching back to their dashboard.
- **Rich Push Bindings:** `expo-notifications` routes backend database trigger events (via Supabase Edge Functions / Triggers) directly into real OS-level push notifications, featuring the institutional splash logo.

### 6. Dynamic Dashboard & Pre-Computed Timetables

<p align="center">
  <img src="assets/images/home%20screen.jpg" width="250" />
  <img src="assets/images/shedule&%20holiday%20info.jpg" width="250" />
</p>

The home UI dynamically computes what the user needs to know next.

- **"Next Class" Hero Module:** A heavily styled, animated top-level hero component mathematically deduces what class is currently active or upcoming next, rendering "Take Attendance" buttons immediately accessible.
- **Auto-Refresh Hooks:** Components automatically poll the schedule endpoint on mount, while `useFocusEffect` seamlessly invalidates stale UI elements when users swap tabs.

### 7. Advanced Class Filtering & Rostering Rules

<p align="center">
  <img src="assets/images/class%20incharge%20screen.jpg" width="250" />
  <img src="assets/images/class%20watchlist%20and%20attendence%20mgt.jpg" width="250" />
  <img src="assets/images/head%20counter-%20submitter.jpg" width="250" />
  <img src="assets/images/report%20screen.jpg" width="250" />
</p>

- **Batch Splitting Logic:** For technical labs, rosters are dynamically filtered (e.g., only loading Batch-1 IDs while hiding Batch-2).
- **Management Viewing:** Admins and Principals immediately bypass branch filtering, granting them sweeping "All Sections" global viewing rights across entirely distinct departments.
- **Tagging Statuses:** The roster UI strictly groups students into visual buckets mapping their underlying boolean conditions: `Present`, `Absent`, `OD (On Duty)`, or `Leave`.

### 8. Authentication & Profile Management

<p align="center">
  <img src="assets/images/login%20screen.jpg" width="250" />
  <img src="assets/images/forgot%20password%20screen.jpg" width="250" />
  <img src="assets/images/profile%20screen.jpg" width="250" />
  <img src="assets/images/help%20screen.jpg" width="250" />
</p>

- **Secure Login:** Role-based enterprise access control tied directly to Supabase Authentication.
- **Profile Hub:** Faculty can globally manage settings, view their institutional details, and orchestrate platform configurations all from a centralized profile screen.

---

## 🏗 Architecture & Feature-Sliced Directory Structure

The project strictly follows the **Feature-Sliced Design (FSD)** pattern. This isolates domain concerns natively instead of mixing generic "screens" and "components".

```text
src/
├── components/         # Cross-domain widgets (e.g. ZenToast, Modals, LoadingAnimations)
├── config/             # Environment variables and API bindings (Supabase instance)
├── constants/          # Application Design System (Colors, Typography, Layout spacing metrics)
├── contexts/           # Global Providers (Auth state, Custom ThemeContext with Dark Mode)
├── features/           # ★ Core Domain Isolation ★
│   ├── attendance/     # Logic: Scanning engines, local session states, Bluetooth controllers
│   ├── dashboard/      # Logic: Home feeds, schedule parsers, "Next Class" heroic UI
│   ├── notifications/  # Logic: WhatsApp-style Notification cards, Swap/Leave inbox management
│   ├── profile/        # Logic: Leave requests, bug reporting, user settings, offline metrics
│   └── swap/           # Logic: Interactive swap request engines, faculty registries
├── hooks/              # Reusable React logic (useConnectionStatus, useDebounce)
├── navigation/         # Central navigation trees (MainTabs vs AuthStacks)
├── services/           # External abstractions (NotificationService, BLE Manager bounds)
├── types/              # Unified database interfaces and React prop mappings
└── utils/              # Pure functions (responsive pixel scaling, date parsers, logger)
```

---

## 💾 Core Database Schema (Supabase)

Below is an overview of the primary high-level database structures orchestrating the campus lifecycle:

### `profiles`

The primary authentication hub joining Supabase Auth with custom enterprise roles (`faculty`, `admin`, `management`).

### `master_timetables`

Stores rigid, institutional class schedules mapped against a `faculty_id`. Serves as the immutable skeleton for the "Dashboard".

### `attendance_sessions`

A dynamic daily log spawned when a faculty initiates a class. Tracks `status` (open, closed), `date`, and resolves `is_substitute` logic.

### `attendance_records`

Specific child entities of a session mapped exactly to a `student_id`. Maintains boolean or enum logic for `present`, `absent`, `od`, or `leave`.

### `class_swaps` & `substitutions`

Pivotal tables for the request engines. Tracks the target slot ID, dates, and resolution status (`pending`, `accepted`, `declined`, `expired`).

---

## 🛠 Workflows & Environment Setup

### 1. Local Development

Clone the repository and install the dependencies:

```bash
git clone https://github.com/your-org/attend-me-app-.git
cd attend-me-app-
npm install
```

Start the interactive Expo bundler:

```bash
npx expo start --clear
```

### 2. Custom Native Dev Client Build (Required for BLE)

Due to rigid hardware access constraints (`react-native-ble-plx` scanning APIs), **the standard Expo Go app CANNOT execute this project natively.**

You must strictly execute prebuilds to drop native OS code:

```bash
# Generate /android and /ios native wrappers
npx expo prebuild --clean

# Compile and install via USB debugging
npx expo run:android --device
# OR
npx expo run:ios --device
```

### 3. State Verification Constraints

When troubleshooting logic flows, observe these state constraints:

- **Offline States:** To test the application's offline resilience, disable Wi-Fi/Data on the physical device. The app should display the `useConnectionStatus` "Offline Mode" toast, but all cached schedule rendering and Swap submission UI must still natively function using `storage.ts`.
- **Bluetooth Bleeding Constraints:** Background execution relies implicitly on `.expo-location` thresholds. Simulators naturally kill this state. Use real hardware running Android 12+ or iOS 15+ for legitimate validation.

---
