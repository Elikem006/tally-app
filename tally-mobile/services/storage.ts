import { currentUser } from "../app/(auth)/login";

export function getUserId(): string {
  return currentUser.userId || "";
}

export function getUserName(): string {
  return currentUser.userName || "User";
}

export function getToken(): string {
  return currentUser.token || "";
}
