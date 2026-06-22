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
- Java JDK 17+ and IntelliJ IDEA
- PostgreSQL running (via Docker or locally)

### 1. Clone the repository
```bash
git clone https://github.com/elikem006/tally-app.git
cd tally-app
```

### 2. Run the Backend
- Open the `backend/` folder in IntelliJ IDEA
- Let Maven download dependencies
- Run the main `Application.java` class
- Backend runs on `http://localhost:8080`

### 3. Run the Frontend
```bash
cd frontend
npm install
npx expo start
```
- Scan the QR code with Expo Go on your phone

---

## Features
- User registration and login (JWT auth)
- Add and track personal expenses by category
- View expense history with totals
- Home dashboard with category breakdown

---

## Team

| Name              | Role                          |
|-------------------|-------------------------------|
| Elikem Emmanuel   | Project Manager + Backend Lead |
| Adam              | Frontend Developer             |
| Mustapha          | Backend Developer              |
| Halal             | Frontend Developer             |
| Joseph            | DevOps + Documentation         |