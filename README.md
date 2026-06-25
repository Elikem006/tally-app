# Tally 💰

A student expense tracking app that helps you manage personal budgets and split shared expenses with friends.

Built as a group project at KNUST.

---

## Tech Stack

| Layer        | Technology                        |
|--------------|-----------------------------------|
| Mobile App   | Expo + React Native + TypeScript  |
| Backend      | Spring Boot (Java)                |
| Database     | PostgreSQL                        |
| Version Control | Git + GitHub                   |

---

## Getting Started

### Prerequisites
- Node.js and npm installed
- Expo Go app on your phone
- Java JDK 21+ and IntelliJ IDEA
- PostgreSQL running (via Docker or locally)

### 1. Clone the repository
```bash
git clone https://github.com/elikem006/tally-app.git
cd tally-app
```

### 2. Run the Backend
- Open the `tally-backend/user-service/user-service/` folder in IntelliJ IDEA
- Let Maven download dependencies
- Run the main `UserServiceApplication.java` class
- Backend runs on `http://localhost:8082`

### 3. Run the Frontend
```bash
cd tally-mobile
npm install --legacy-peer-deps
npx expo start
```
- Scan the QR code with Expo Go on your phone > Important: Your phone and laptop must be on the same WiFi network. Before scanning the QR code, open `tally-mobile/services/api.ts` and update the `BASE_URL` with your laptop's current IP address. Run `ipconfig` in PowerShell to find it (look for the IPv4 address under your WiFi adapter).

---

## Features
- User registration and login (JWT auth)
- Add and track personal expenses by category
- View expense history with totals
- Home dashboard with category breakdown
- Budget tracking with category limits
- Group creation and management
- Shared expense splitting between group members

---

## Team

| Name              | Role                          |
|-------------------|-------------------------------|
| Elikem Emmanuel   | Project Manager + Backend Lead |
| Adam              | Frontend Developer             |
| Mustapha          | Backend Developer              |
| Halal             | Frontend Developer             |
| Joseph            | DevOps + Documentation         |