# API Testing Results
**Tested by:** Mustapha  
**Date:** 25 June 2026  
**Backend URL:** http://localhost:8082  
**Tool:** Postman

---

## Authentication Endpoints

### 1. Register User
**Endpoint:** `POST /api/auth/register`  
**Request Body:**
```json
{
  "name": "Mustapha",
  "email": "mustapha@test.com",
  "password": "123456"
}
```
**Response:**
```json
{
  "message": "Registration successful",
  "userId": 1,
  "email": "mustapha@test.com",
  "name": "Mustapha"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 2. Login User
**Endpoint:** `POST /api/auth/login`  
**Request Body:**
```json
{
  "email": "mustapha@test.com",
  "password": "123456"
}
```
**Response:**
```json
{
  "name": "Mustapha",
  "userId": 1,
  "email": "mustapha@test.com",
  "token": "eyJhbGciOiJIUzI1NiJ9..."
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 3. Health Check
**Endpoint:** `GET /api/auth/health`  
**Headers:** None  
**Request Body:** None  
**Response:**
```json
{
  "status": "User service is running"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

## Expense Endpoints

### 4. Create Expense
**Endpoint:** `POST /api/expenses`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "userId": "1",
  "amount": "50",
  "category": "Food",
  "description": "Lunch",
  "date": "2026-06-25"
}
```
**Response:**
```json
{
  "id": 1,
  "userId": 1,
  "amount": 50.00,
  "category": "Food",
  "description": "Lunch",
  "date": "2026-06-25"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 5. Get User Expenses
**Endpoint:** `GET /api/expenses/user/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "amount": 50.00,
    "category": "Food",
    "description": "Lunch",
    "date": "2026-06-25"
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 6. Get Expenses by Category
**Endpoint:** `GET /api/expenses/user/1?category=Food`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "amount": 50.00,
    "category": "Food",
    "description": "Lunch",
    "date": "2026-06-25"
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 7. Get Monthly Report
**Endpoint:** `GET /api/expenses/user/1/report?month=6&year=2026`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "currentMonth": "50.00",
  "highestCategory": {
    "category": "Food",
    "totalSpent": "50.00"
  },
  "topExpense": {
    "id": 1,
    "amount": "50.00",
    "category": "Food",
    "description": "Lunch",
    "date": "2026-06-25"
  }
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 8. Get Combined History
**Endpoint:** `GET /api/expenses/user/1/history`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "amount": 50.00,
    "category": "Food",
    "description": "Lunch",
    "date": "2026-06-25"
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 9. Delete Expense
**Endpoint:** `DELETE /api/expenses/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "message": "Expense deleted successfully"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

## Budget Endpoints

### 10. Create Budget
**Endpoint:** `POST /api/budgets`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "userId": "1",
  "category": "Food",
  "monthlyLimit": "500"
}
```
**Response:**
```json
{
  "id": 1,
  "userId": 1,
  "category": "Food",
  "monthlyLimit": 500,
  "createdAt": "2026-06-25T..."
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 11. Get User Budgets
**Endpoint:** `GET /api/budgets/user/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "category": "Food",
    "monthlyLimit": 500,
    "createdAt": "2026-06-25T..."
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 12. Get Budget Summary
**Endpoint:** `GET /api/budgets/user/1/summary`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "Food": {
    "limit": 500,
    "spent": 50,
    "remaining": 450,
    "percentage": 10,
    "isOverBudget": false,
    "isNearLimit": false
  }
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 13. Delete Budget
**Endpoint:** `DELETE /api/budgets/user/1/Food`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "message": "Budget deleted"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

## Group Endpoints

### 14. Create Group
**Endpoint:** `POST /api/groups`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "name": "Tally Test Group",
  "createdBy": "1"
}
```
**Response:**
```json
{
  "id": 1,
  "name": "Tally Test Group",
  "createdBy": 1,
  "createdAt": "2026-06-25T20:37:31.1031102"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 15. Get User Groups
**Endpoint:** `GET /api/groups/user/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "name": "Tally Test Group",
    "createdBy": 1,
    "createdAt": "2026-06-25T20:37:31.10311"
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 16. Add Member to Group
**Endpoint:** `POST /api/groups/1/members`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "userId": "1"
}
```
**Response:**
```json
{
  "error": "User is already a member of this group"
}
```
**Status Code:** 400 Bad Request  
**Result:** ✅ Pass (duplicate member check works correctly)

---

### 17. Get Group Details
**Endpoint:** `GET /api/groups/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "members": [
    {
      "id": 1,
      "groupId": 1,
      "userId": 1,
      "joinedAt": "2026-06-25T20:37:31.21557"
    }
  ],
  "group": {
    "id": 1,
    "name": "Tally Test Group",
    "createdBy": 1,
    "createdAt": "2026-06-25T20:37:31.10311"
  }
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 18. Add Shared Expense
**Endpoint:** `POST /api/groups/1/expenses`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "paidBy": "1",
  "amount": "100",
  "description": "Dinner"
}
```
**Response:**
```json
{
  "id": 1,
  "groupId": 1,
  "paidBy": 1,
  "amount": 100,
  "description": "Dinner",
  "splitType": "EQUAL",
  "createdAt": "2026-06-25T20:47:32.5700948"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 19. Get Group Balances
**Endpoint:** `GET /api/groups/1/balances`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass (empty — only 1 member in group)

---

### 20. Settle Up
**Endpoint:** `POST /api/groups/1/settle`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "userId": "1"
}
```
**Response:**
```json
{
  "groupId": 1,
  "message": "Successfully settled up — all expenses cleared",
  "userId": 1
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 21. Delete Group
**Endpoint:** `DELETE /api/groups/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "message": "Group deleted successfully"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

## Reminder Endpoints

### 22. Create Reminder
**Endpoint:** `POST /api/reminders`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:**
```json
{
  "userId": "1",
  "title": "Rent",
  "amount": "500",
  "dueDate": "2026-07-01",
  "isRecurring": "true",
  "recurrenceType": "monthly"
}
```
**Response:**
```json
{
  "id": 1,
  "userId": 1,
  "title": "Rent",
  "amount": 500,
  "dueDate": "2026-07-01",
  "isRecurring": true,
  "recurrenceType": "monthly",
  "isPaid": false
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 23. Get User Reminders
**Endpoint:** `GET /api/reminders/user/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "userId": 1,
    "title": "Rent",
    "amount": 500,
    "dueDate": "2026-07-01",
    "isRecurring": true,
    "isPaid": false
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 24. Get Upcoming Reminders
**Endpoint:** `GET /api/reminders/user/1/upcoming`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
[
  {
    "id": 1,
    "title": "Rent",
    "amount": 500,
    "dueDate": "2026-07-01",
    "isPaid": false
  }
]
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 25. Mark Reminder as Paid
**Endpoint:** `PUT /api/reminders/1/paid`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "id": 1,
  "title": "Rent",
  "amount": 500,
  "isPaid": true
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 26. Delete Reminder
**Endpoint:** `DELETE /api/reminders/1`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "message": "Reminder deleted"
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

## Summary

| # | Endpoint | Method | Status |
|---|----------|--------|--------|
| 1 | /api/auth/register | POST | ✅ Pass |
| 2 | /api/auth/login | POST | ✅ Pass |
| 3 | /api/auth/health | GET | ✅ Pass |
| 4 | /api/expenses | POST | ✅ Pass |
| 5 | /api/expenses/user/1 | GET | ✅ Pass |
| 6 | /api/expenses/user/1?category=Food | GET | ✅ Pass |
| 7 | /api/expenses/user/1/report | GET | ✅ Pass |
| 8 | /api/expenses/user/1/history | GET | ✅ Pass |
| 9 | /api/expenses/1 | DELETE | ✅ Pass |
| 10 | /api/budgets | POST | ✅ Pass |
| 11 | /api/budgets/user/1 | GET | ✅ Pass |
| 12 | /api/budgets/user/1/summary | GET | ✅ Pass |
| 13 | /api/budgets/user/1/Food | DELETE | ✅ Pass |
| 14 | /api/groups | POST | ✅ Pass |
| 15 | /api/groups/user/1 | GET | ✅ Pass |
| 16 | /api/groups/1/members | POST | ✅ Pass |
| 17 | /api/groups/1 | GET | ✅ Pass |
| 18 | /api/groups/1/expenses | POST | ✅ Pass |
| 19 | /api/groups/1/balances | GET | ✅ Pass |
| 20 | /api/groups/1/settle | POST | ✅ Pass |
| 21 | /api/groups/1 | DELETE | ✅ Pass |
| 22 | /api/reminders | POST | ✅ Pass |
| 23 | /api/reminders/user/1 | GET | ✅ Pass |
| 24 | /api/reminders/user/1/upcoming | GET | ✅ Pass |
| 25 | /api/reminders/1/paid | PUT | ✅ Pass |
| 26 | /api/reminders/1 | DELETE | ✅ Pass |