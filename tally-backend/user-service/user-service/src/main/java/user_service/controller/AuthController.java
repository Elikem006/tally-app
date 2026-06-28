package user_service.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import user_service.model.User;
import user_service.service.UserService;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private UserService userService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        try {
            String name = request.get("name");
            String email = request.get("email");
            String password = request.get("password");

            if (name == null || name.isBlank() || email == null || email.isBlank()
                    || password == null || password.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Name, email and password are required"));
            }

            User user = userService.registerUser(name, email, password);

            return ResponseEntity.ok(Map.of(
                    "message", "Registration successful",
                    "userId", user.getId(),
                    "name", user.getName(),
                    "email", user.getEmail()
            ));

        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        try {
            String email = request.get("email");
            String password = request.get("password");

            if (email == null || password == null) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Email and password are required"));
            }

            Map<String, Object> result = userService.loginUser(email, password);
            return ResponseEntity.ok(result);

        } catch (RuntimeException e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", e.getMessage()));
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
                    "avatarData", user.getAvatarData() != null ? user.getAvatarData() : ""
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
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
                    "avatarData", user.getAvatarData() != null ? user.getAvatarData() : ""
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PutMapping("/user/{userId}/phone")
    public ResponseEntity<?> updatePhone(
            @PathVariable Long userId,
            @RequestBody Map<String, String> request) {
        try {
            String phoneNumber = request.get("phoneNumber");
            if (phoneNumber == null || phoneNumber.isBlank()) {
                return ResponseEntity.badRequest()
                        .body(Map.of("error", "Phone number is required"));
            }
            var user = userService.updatePhoneNumber(userId, phoneNumber);
            return ResponseEntity.ok(Map.of(
                    "message", "Phone number updated",
                    "phoneNumber", user.getPhoneNumber()
            ));
        } catch (RuntimeException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of("status", "User service is running"));
    }
}