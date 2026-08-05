package auth_service.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import auth_service.AuthGuard;
import auth_service.RateLimiter;
import auth_service.client.DownstreamUnavailableException;
import auth_service.client.GroupServiceClient;
import auth_service.model.User;
import auth_service.service.UserService;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    // Failed-login lockout: 5 failures per email within 15 minutes → 429
    private static final int LOGIN_MAX_FAILURES = 5;
    private static final long LOGIN_WINDOW_MS = 15 * 60 * 1000;

    @Autowired
    private UserService userService;

    @Autowired
    private RateLimiter rateLimiter;

    @Autowired
    private GroupServiceClient groupServiceClient;

    // Lookup is called once per screen render (batched), not once per user —
    // 60/min per caller comfortably covers real usage while still bounding
    // enumeration attempts against the co-member filter below.
    private static final int LOOKUP_MAX_PER_WINDOW = 60;
    private static final long LOOKUP_WINDOW_MS = 60 * 1000;

    // Exceptions like NullPointerException can carry a null message — Map.of rejects null values
    private static String errorMessage(Exception e) {
        return e.getMessage() != null ? e.getMessage() : "An unexpected error occurred";
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        try {
            String name = request.get("name");
            String email = request.get("email");
            String password = request.get("password");

            if (name == null || name.isBlank() || email == null || email.isBlank()
                    || password == null || password.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Name, email and password are required", "success", false));
            }

            User user = userService.registerUser(name, email, password);

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message", "Registration successful",
                    "userId", user.getId(),
                    "name", user.getName(),
                    "email", user.getEmail(),
                    "success", true
            ));

        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        String password = request.get("password");

        if (email == null || password == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email and password are required", "success", false));
        }

        String limitKey = "login:" + email.toLowerCase().trim();
        if (rateLimiter.isBlocked(limitKey, LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS)) {
            return ResponseEntity.status(429)
                    .body(Map.of("error", "Too many failed attempts. Please try again in 15 minutes.", "success", false));
        }

        try {
            Map<String, Object> result = userService.loginUser(email, password);
            rateLimiter.reset(limitKey);
            result.put("success", true);
            return ResponseEntity.ok(result);

        } catch (RuntimeException e) {
            rateLimiter.recordFailure(limitKey, LOGIN_WINDOW_MS);
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @PutMapping("/user/{userId}/avatar")
    public ResponseEntity<?> updateAvatar(
            @PathVariable Long userId,
            @RequestBody Map<String, String> request) {
        try {
            String avatarType = request.get("avatarType");
            String avatarData = request.get("avatarData");
            var user = userService.updateAvatar(userId, avatarType, avatarData);
            return ResponseEntity.ok(Map.of(
                    "message", "Avatar updated",
                    "avatarType", user.getAvatarType() != null ? user.getAvatarType() : "",
                    "avatarData", user.getAvatarData() != null ? user.getAvatarData() : "",
                    "success", true
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * GET /api/auth/users/{userId}/exists — bare existence check, no PII.
     *
     * Deliberately separate from GET /user/{userId} (which JwtAuthFilter
     * restricts to self-lookup only) and from POST /users/lookup (which
     * requires a shared-group context — useless here, since checking
     * whether someone you're ABOUT to invite exists is exactly the case
     * where you don't share a group with them yet). Any authenticated user
     * may check any userId; the response reveals nothing beyond a boolean,
     * so there's nothing worth restricting further than rate-limiting.
     */
    @GetMapping("/users/{userId}/exists")
    public ResponseEntity<?> userExists(@PathVariable Long userId, HttpServletRequest httpRequest) {
        Long callerId = AuthGuard.authUserId(httpRequest);
        if (callerId == null) {
            return ResponseEntity.status(401)
                    .body(Map.of("error", "Session expired. Please log in again.", "success", false));
        }
        if (!rateLimiter.allow("exists:" + callerId, 60, 60 * 1000)) {
            return ResponseEntity.status(429)
                    .body(Map.of("error", "Too many requests. Please slow down.", "success", false));
        }
        return ResponseEntity.ok(Map.of("userId", userId, "exists", userService.userExists(userId), "success", true));
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<?> getUserById(@PathVariable Long userId) {
        try {
            var user = userService.getUserById(userId);
            return ResponseEntity.ok(Map.of(
                    "userId", user.getId(),
                    "name", user.getName(),
                    "email", user.getEmail(),
                    "avatarType", user.getAvatarType() != null ? user.getAvatarType() : "",
                    "avatarData", user.getAvatarData() != null ? user.getAvatarData() : "",
                    "success", true
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    /**
     * PUT /api/auth/user/{userId}/profile — edit name and/or email.
     * Self-only: JwtAuthFilter's /user/{id} ownership check covers this path.
     */
    @PutMapping("/user/{userId}/profile")
    public ResponseEntity<?> updateProfile(
            @PathVariable Long userId,
            @RequestBody Map<String, String> request) {
        try {
            String name = request.get("name");
            String email = request.get("email");
            if (name == null && email == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Provide a name or email to update", "success", false));
            }
            // Required by updateProfile only when the email actually changes
            var user = userService.updateProfile(userId, name, email, request.get("currentPassword"));
            return ResponseEntity.ok(Map.of(
                    "message", "Profile updated",
                    "userId", user.getId(),
                    "name", user.getName(),
                    "email", user.getEmail(),
                    "success", true
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @PutMapping("/user/{userId}/phone")
    public ResponseEntity<?> updatePhone(
            @PathVariable Long userId,
            @RequestBody Map<String, String> request) {
        try {
            String phoneNumber = request.get("phoneNumber");
            // Empty string means clear the number; null means field was missing entirely
            if (phoneNumber == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "phoneNumber field is required", "success", false));
            }
            if (phoneNumber.isEmpty()) {
                // Clear the number
                var user = userService.updatePhoneNumber(userId, null);
                return ResponseEntity.ok(Map.of(
                        "message", "Phone number removed",
                        "phoneNumber", "",
                        "success", true
                ));
            }
            var user = userService.updatePhoneNumber(userId, phoneNumber);
            return ResponseEntity.ok(Map.of(
                    "message", "Phone number updated",
                    "phoneNumber", user.getPhoneNumber() != null ? user.getPhoneNumber() : "",
                    "success", true
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            if (email == null || email.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Email is required", "success", false));
            }
            String otp = userService.generatePasswordResetOtp(email);

            // Map.of rejects null — otp is only non-null when otp.debug-expose is on
            Map<String, Object> response = new java.util.HashMap<>();
            response.put("message", "OTP sent to your email");
            response.put("success", true);
            if (otp != null) {
                response.put("otp", otp);
                response.put("note", "Debug mode is on for this environment — the OTP is included here in addition to being emailed.");
            }
            return ResponseEntity.ok(response);
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            String otp = request.get("otp");
            String newPassword = request.get("newPassword");

            if (email == null || email.isBlank()
                    || otp == null || otp.isBlank()
                    || newPassword == null || newPassword.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Email, OTP, and new password are required", "success", false));
            }

            userService.verifyOtpAndResetPassword(email, otp, newPassword);
            return ResponseEntity.ok(Map.of(
                    "message", "Password reset successfully. Please log in with your new password.",
                    "success", true
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of("status", "User service is running", "success", true));
    }

    /**
     * POST /api/auth/users/lookup — batch display-info lookup (name + avatar)
     * for a set of userIds. Used by other Tally services (e.g. group-service
     * enriching members/balances) instead of reading the users table directly.
     *
     * Resolution is restricted to userIds the caller actually shares a group
     * with (plus the caller's own id) — verified against group-service on
     * every call, not trusted from the request. Without this, any
     * authenticated user could pass an arbitrary userId and get back a
     * stranger's name and avatar. Requested ids outside that set are
     * silently dropped rather than erroring the whole batch, so one stale
     * id in a client-cached list doesn't break the rest of the response.
     */
    @PostMapping("/users/lookup")
    public ResponseEntity<?> lookupUsers(@RequestBody Map<String, List<Long>> request,
                                         HttpServletRequest httpRequest) {
        try {
            Long callerId = AuthGuard.authUserId(httpRequest);
            if (callerId == null) {
                return ResponseEntity.status(401)
                        .body(Map.of("error", "Session expired. Please log in again.", "success", false));
            }

            if (!rateLimiter.allow("lookup:" + callerId, LOOKUP_MAX_PER_WINDOW, LOOKUP_WINDOW_MS)) {
                return ResponseEntity.status(429)
                        .body(Map.of("error", "Too many lookup requests. Please slow down.", "success", false));
            }

            List<Long> requested = request.get("userIds");
            if (requested == null || requested.isEmpty()) {
                return ResponseEntity.ok(Map.of());
            }

            Set<Long> allowed;
            try {
                allowed = groupServiceClient.getCoMemberIds(callerId, httpRequest.getHeader("Authorization"));
            } catch (DownstreamUnavailableException e) {
                // Fail closed: no verified shared context means no disclosure,
                // rather than trusting the request while group-service is down.
                allowed = new HashSet<>();
            }
            allowed = new HashSet<>(allowed);
            allowed.add(callerId); // callers can always resolve their own display info

            Set<Long> allowedFinal = allowed;
            List<Long> filtered = requested.stream().filter(allowedFinal::contains).toList();

            return ResponseEntity.ok(userService.lookupUsers(filtered));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", errorMessage(e), "success", false));
        }
    }
}
