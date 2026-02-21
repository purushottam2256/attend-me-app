<p align="center">
  <img src="assets/images/app%20logo.png" width="200" />
</p>

<h1 align="center">Attend-Me</h1>

<p align="center">
  <b> Offline-First BLE Attendance System for Educational Institutions</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/react_native-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB" />
  <img src="https://img.shields.io/badge/expo-1C1E24?style=for-the-badge&logo=expo&logoColor=#D04A37" />
  <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" />
  <img src="https://img.shields.io/badge/BLE-0082FC?style=for-the-badge&logo=bluetooth&logoColor=white" />
</p>

---

## 📖 About

Attend-Me is a premier mobile application engineered specifically for MRCE (Malla Reddy College of Engineering) to automate and streamline attendance tracking using Bluetooth Low Energy (BLE) technology. Built with React Native and powered by Supabase, the app delivers a seamless, offline-first experience that works reliably even in campus dead-zones with poor connectivity.

The system supports faculty, administrators, and management roles — providing tailored dashboards, class swap workflows, leave management, push notifications, and detailed attendance analytics all within a single unified platform.

---

## 📸 Screenshots

<p align="center">
  <img src="assets/images/splash%20screen.jpg" width="200" />
  <img src="assets/images/login%20screen.jpg" width="200" />
  <img src="assets/images/forgot%20password%20screen.jpg" width="200" />
</p>
<p align="center"><i>Splash Screen • Login • Forgot Password</i></p>

<br/>

<p align="center">
  <img src="assets/images/home%20screen.jpg" width="200" />
  <img src="assets/images/shedule&%20holiday%20info.jpg" width="200" />
  <img src="assets/images/profile%20screen.jpg" width="200" />
</p>
<p align="center"><i>Dashboard Home • Schedule & Holidays • Profile</i></p>

<br/>

<p align="center">
  <img src="assets/images/ble%20scanner%20screen.jpg" width="200" />
  <img src="assets/images/ble%20animation%20screen.jpg" width="200" />
  <img src="assets/images/beacon%20analyzer.jpg" width="200" />
</p>
<p align="center"><i>BLE Scanner • Scan Animation • Beacon Analyzer</i></p>

<br/>

<p align="center">
  <img src="assets/images/class%20incharge%20screen.jpg" width="200" />
  <img src="assets/images/class%20watchlist%20and%20attendence%20mgt.jpg" width="200" />
  <img src="assets/images/head%20counter-%20submitter.jpg" width="200" />
</p>
<p align="center"><i>Class Incharge • Watchlist & Attendance • Head Counter</i></p>

<br/>

<p align="center">
  <img src="assets/images/history%20screen%20with%20filter.jpg" width="200" />
  <img src="assets/images/history%20screen-calender.jpg" width="200" />
  <img src="assets/images/report%20screen.jpg" width="200" />
</p>
<p align="center"><i>History with Filters • Calendar View • Reports</i></p>

<br/>

<p align="center">
  <img src="assets/images/sub&swap%20screen.jpg" width="200" />
  <img src="assets/images/notification%20screen.jpg" width="200" />
  <img src="assets/images/offline%C3%A8sync%20manager.jpg" width="200" />
</p>
<p align="center"><i>Swap & Substitute • Notifications • Offline Sync Manager</i></p>

<br/>

<p align="center">
  <img src="assets/images/leave%20granter.jpg" width="200" />
  <img src="assets/images/od%20%20granter.jpg" width="200" />
  <img src="assets/images/od&leave%20%20manager.jpg" width="200" />
</p>
<p align="center"><i>Leave Granter • OD Granter • OD & Leave Manager</i></p>

<br/>

<p align="center">
  <img src="assets/images/faculty%20leave.jpg" width="200" />
  <img src="assets/images/leaves%20status.jpg" width="200" />
  <img src="assets/images/help%20screen.jpg" width="200" />
</p>
<p align="center"><i>Faculty Leave • Leave Status • Help & Support</i></p>

---

## 🚀 Feature Set

### 1. Automated BLE Beacon Scanning & Proximity Logic

The primary engine behind touchless attendance powered by Bluetooth Low Energy.

- **Foreground & Background Execution:** Uses `react-native-ble-plx` for active scanning. Leverages `expo-location` and `expo-task-manager` for background threads that continue scanning even when the device is locked.
- **Deduplication & Smart Queueing:** A deduplication engine processes each beacon payload once, marks the student as "Present", and drops subsequent identical packets to save memory.
- **Time-Boundary Validation:** Scans are only accepted if they align with the `start_time` and `end_time` bounds of an active schedule slot.
- **Beacon Signal Analyzer:** In-built signal strength visualization and beacon proximity metrics for debugging and calibration.

### 2. Deep Offline-First Architecture & Optimistic Sync

The app ensures absolutely zero data loss, even in campus dead-zones.

- **Native SQLite Caching:** The entire active timetable and roster lists are stored in structured SQLite relational tables via `expo-sqlite`, eliminating JSON parsing overhead that causes UI freezes.
- **Optimistic UI Rendering:** When faculty submit requests or log students, the React state mutates instantly for immediate visual feedback.
- **Background Sync Queues:** A global `OfflineService` singleton intercepts all mutations. If `NetInfo` reports an offline state, queries are cached into a persistent queue. Once connectivity restores, the service automatically flushes the queue to Supabase without user intervention.
- **Smart Roster Sync:** An intelligent background sync engine downloads and caches student rosters class-by-class with thread-yielding to maintain 60 FPS during heavy payloads.
- **SQLite Garbage Collection:** Outdated roster data is automatically purged via native SQL `DELETE` operations — no memory-heavy JavaScript loops required.

### 3. Faculty Swap & Substitute Exchange

A robust workflow for faculty to seamlessly hand-off class responsibilities.

- **Substitute Requests:** Faculty can select any upcoming class and directly request a departmental peer to cover the slot.
- **Direct Time-Slot Swaps:** Faculty can browse peers teaching parallel sections and propose a direct 1:1 time swap. The UI maps "Take Class" against "Give Class" parameters.
- **Conflict Prevention Engine:** Real-time database checks validate whether the requested faculty already has a conflicting schedule at the same slot.
- **Request Lifecycle:** Requests exist as `pending` and transition to `accepted`, `declined`, or automatically flag as `expired` if the class start time passes without resolution.

### 4. Enterprise Leave & OD Management

Complete administrative control over faculty and student leave workflows.

- **End-to-End Leave Tracking:** Faculty submit structured leave applications (notes, start/end dates) stored securely in Supabase.
- **OD (On Duty) Granting:** Faculty can grant OD status to students, which is tracked separately from regular attendance and counted as "Present."
- **Dashboard Suspension:** When a faculty leave is approved, the app automatically suspends their dashboard, preventing false attendance reports during their absence.
- **Leave Status Tracking:** Real-time visibility into leave request statuses with clear pending/approved/declined indicators.

### 5. Push Notifications & Actionable Inbox

Priority-based enterprise notification system modeled after professional inboxes.

- **Categorized Inboxes:** Segmented routing separates "System Alerts" from actionable "Requests" and "Leave Status" updates.
- **Actionable Cards:** Each card details the originator, target department, section, and slot ID. Faculty can Accept or Decline directly from the notification without switching screens.
- **Rich Push Notifications:** `expo-notifications` routes backend database trigger events directly into real OS-level push notifications with the institutional logo.
- **Persistent State:** Dismissed notifications stay dismissed across app reloads — no ghost re-appearances.

### 6. Dynamic Dashboard & Pre-Computed Timetables

The home UI dynamically computes what the user needs to know next.

- **"Next Class" Hero Module:** An animated top-level component deduces what class is active or upcoming, with immediate "Take Attendance" access.
- **Schedule Visualization:** Full daily timetable with time slots, room numbers, and subject details. Consecutive classes are intelligently merged.
- **Holiday Awareness:** The dashboard recognizes institutional holidays and adjusts the schedule display accordingly.
- **Auto-Refresh Hooks:** Components automatically poll on mount, while `useFocusEffect` invalidates stale UI when switching tabs.

### 7. Advanced Class Filtering & Rostering

Sophisticated roster management with role-based access controls.

- **Automated Batch Splitting:** For lab classes, rosters are dynamically filtered based on batch information from the schedule data — no manual selection needed.
- **Management Viewing:** Admins and Principals bypass branch filtering, gaining "All Sections" global viewing rights across all departments.
- **Student Status Tagging:** The roster UI groups students into visual buckets: `Present`, `Absent`, `OD (On Duty)`, or `Leave` with color-coded tags.
- **Head Counter:** Real-time attendance counter showing present/absent ratios with one-tap submission.

### 8. Authentication & Profile Management

Secure, role-based access control for the institution.

- **Supabase Authentication:** Enterprise login with email/password, integrated with Supabase Auth.
- **Role-Based Access:** Separate experiences for `faculty`, `admin`, and `management` roles with tailored permissions and dashboards.
- **Password Recovery:** Secure forgot-password flow with email-based OTP verification.
- **Profile Hub:** Faculty can manage settings, view institutional details, and access platform configurations from a centralized profile screen.
- **Help & Support:** In-app help documentation and bug reporting functionality.

### 9. Attendance History & Analytics

Comprehensive reporting tools for tracking historical attendance data.

- **Filtered History:** Browse past attendance sessions with multi-criteria filters (date range, subject, section).
- **Calendar View:** Visual calendar interface showing attendance session dates at a glance.
- **Detailed Reports:** Per-session breakdown of present, absent, OD, and leave counts with exportable data.

---

## 🏗 Architecture

The project strictly follows the **Feature-Sliced Design (FSD)** pattern, isolating domain concerns natively instead of mixing generic screens and components.

```
src/
├── components/         # Cross-domain widgets (Toasts, Modals, Loading Animations)
├── config/             # Environment variables and API bindings (Supabase)
├── constants/          # Design System (Colors, Typography, Spacing)
├── contexts/           # Global Providers (Auth, Theme with Dark Mode, Offline Sync)
├── features/           # ★ Core Domain Isolation ★
│   ├── attendance/     #   Scanning engines, session states, BLE controllers
│   ├── dashboard/      #   Home feeds, schedule parsers, "Next Class" hero UI
│   ├── notifications/  #   Notification cards, Swap/Leave inbox management
│   ├── profile/        #   Leave requests, bug reporting, settings, offline metrics
│   └── swap/           #   Swap request engines, faculty registries
├── hooks/              # Reusable React logic (useNetworkStatus, useDebounce)
├── navigation/         # Navigation trees (MainTabs vs AuthStacks)
├── services/           # External abstractions
│   ├── offline/        #   SQLite storage, sync engine, queue, cache, migration
│   ├── backgroundSync  #   Background fetch & foreground sync triggers
│   └── dashboardService#   Timetable & attendance data fetching
├── types/              # Unified TypeScript interfaces
└── utils/              # Pure functions (responsive scaling, date parsing, logger)
```

---

## 💾 Database Schema (Supabase)

| Table                 | Purpose                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`            | Authentication hub joining Supabase Auth with institutional roles (`faculty`, `admin`, `management`). Stores department, designation, and device tokens. |
| `subjects`            | Master subject catalog with codes, names, and department mappings.                                                                                       |
| `students`            | Student registry with roll numbers, department/year/section, Bluetooth UUIDs for BLE scanning, and batch assignments.                                    |
| `master_timetables`   | Rigid institutional schedules mapped against `faculty_id`. Defines day, slot, time range, room, target class, and batch.                                 |
| `attendance_sessions` | Dynamic daily logs spawned when faculty initiates a class. Tracks status (open/closed), date, and substitute logic.                                      |
| `attendance_records`  | Per-student attendance entries linked to a session. Maintains `present`, `absent`, `od`, or `leave` status.                                              |
| `class_swaps`         | Swap request records tracking both faculty, their respective slots, date, and resolution status.                                                         |
| `substitutions`       | Substitute request records with original faculty, substitute faculty, slot, date, and lifecycle status.                                                  |
| `leave_requests`      | Faculty leave applications with date ranges, custom notes, and approval status.                                                                          |
| `admins`              | Supplementary admin table for elevated role management.                                                                                                  |

---

## 🔧 Tech Stack

| Category             | Technology                                      |
| -------------------- | ----------------------------------------------- |
| **Framework**        | React Native 0.81 + Expo SDK 54                 |
| **Language**         | TypeScript 5.9                                  |
| **Backend**          | Supabase (PostgreSQL + Auth + Realtime)         |
| **Local Database**   | expo-sqlite (WAL mode, relational tables)       |
| **BLE**              | react-native-ble-plx                            |
| **Navigation**       | React Navigation 6 (Native Stack + Bottom Tabs) |
| **Animations**       | React Native Reanimated 4                       |
| **Notifications**    | expo-notifications                              |
| **Background Tasks** | expo-task-manager + expo-background-fetch       |
| **Location**         | expo-location (for BLE background scanning)     |
| **State Management** | React Context + Custom Hooks                    |
| **Styling**          | StyleSheet (Custom Design System)               |
| **Fonts**            | Inter (via @expo-google-fonts)                  |

---

## 🛠 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)
- Android Studio (for Android builds) or Xcode (for iOS builds)
- Physical device (BLE scanning does not work on emulators)

### Installation

```bash
# Clone the repository
git clone https://github.com/purushottam2256/attend-me-app.git
cd attend-me-app-

# Install dependencies
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_KEY=your_supabase_anon_key
```

### Running the App

```bash
# Start the Expo dev server
npx expo start --clear

# For tunnel mode (when LAN isn't available)
npx expo start --tunnel
```

### Building a Native Dev Client (Required for BLE)

Due to hardware access constraints with `react-native-ble-plx`, **the standard Expo Go app cannot run this project**. You must build a custom dev client:

```bash
# Generate native wrappers
npx expo prebuild --clean

# Build and install on a physical device via USB
npx expo run:android --device
# OR
npx expo run:ios --device
```

---

## 🧪 Testing & Verification

### Offline Resilience

Disable Wi-Fi/Data on the physical device. The app should display an "Offline Mode" banner, but all cached schedule rendering, attendance submission UI, and swap workflows must still function using the local SQLite database.

### BLE Scanning

Background execution relies on `expo-location` thresholds. Emulators cannot accurately simulate this — use real hardware running Android 12+ or iOS 15+ for legitimate BLE validation.

### TypeScript Type Checking

```bash
npx tsc --noEmit
```

---

## 📁 Key Configuration Files

| File                  | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `app.json`            | Expo project configuration, permissions, splash screen |
| `tsconfig.json`       | TypeScript compiler options with path aliases          |
| `babel.config.js`     | Babel presets and module resolver for `@` path aliases |
| `.env`                | Environment variables for Supabase connection          |
| `database/schema.sql` | Complete Supabase database schema                      |

---

## 📄 License

This project is proprietary software developed for MRCE (Malla Reddy College of Engineering). All rights reserved.

---

<p align="center">
  <b>Built with ❤️ for MRCE</b>
</p>
