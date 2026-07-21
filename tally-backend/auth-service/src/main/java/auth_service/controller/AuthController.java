package auth_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import auth_service.RateLimiter;
import auth_service.model.User;
import auth_service.service.UserService;
import java.util.Map;

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
            return ResponseEntity.ok(Map.of(
                    "message", "OTP sent to your email",
                    "otp", otp,
                    "note", "In production the OTP would be sent via email. For testing it is returned here.",
                    "success", true
            ));
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
}
