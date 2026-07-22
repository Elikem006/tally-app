package group_service;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Helpers for controllers to verify body/query userIds against the
 * authenticated user established by JwtAuthFilter.
 */
public final class AuthGuard {

    private AuthGuard() {
    }

    /** The authenticated userId set by JwtAuthFilter, or null on public paths. */
    public static Long authUserId(HttpServletRequest request) {
        Object value = request.getAttribute("authUserId");
        return (value instanceof Long l) ? l : null;
    }

    /**
     * Throws when a body/query-supplied userId doesn't match the authenticated
     * user. No-op when either side is unknown (public path or missing field).
     */
    public static void requireSameUser(HttpServletRequest request, Long userId) {
        Long auth = authUserId(request);
        if (auth != null && userId != null && !auth.equals(userId)) {
            throw new RuntimeException("Unauthorized: you can only act on your own data");
        }
    }
}
