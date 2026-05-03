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

            // Validate inputs
            if (name == null || email == null || password == null) {
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

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of("status", "User service is running"));
    }
}