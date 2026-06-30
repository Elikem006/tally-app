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

## Budget Endpoints

### 3. Create Budget
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

### 4. Get User Budgets
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

### 5. Get Budget Summary
**Endpoint:** `GET /api/budgets/user/1/summary`  
**Headers:** `Authorization: Bearer <token>`  
**Request Body:** None  
**Response:**
```json
{
  "userId": 1,
  "budgets": [
    {
      "category": "Food",
      "monthlyLimit": 500,
      "spent": 0,
      "remaining": 500
    }
  ]
}
```
**Status Code:** 200 OK  
**Result:** ✅ Pass

---

### 6. Delete Budget
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

### 7. Create Group
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

### 8. Get User Groups
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

### 9. Add Member to Group
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

### 10. Get Group Details
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

## Summary

| # | Endpoint | Method | Status |
|---|----------|--------|--------|
| 1 | /api/auth/register | POST | ✅ Pass |
| 2 | /api/auth/login | POST | ✅ Pass |
| 3 | /api/budgets | POST | ✅ Pass |
| 4 | /api/budgets/user/1 | GET | ✅ Pass |
| 5 | /api/budgets/user/1/summary | GET | ✅ Pass |
| 6 | /api/budgets/user/1/Food | DELETE | ✅ Pass |
| 7 | /api/groups | POST | ✅ Pass |
| 8 | /api/groups/user/1 | GET | ✅ Pass |
| 9 | /api/groups/1/members | POST | ✅ Pass |
| 10 | /api/groups/1 | GET | ✅ Pass |