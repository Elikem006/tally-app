package auth_service.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import auth_service.JwtUtil;
import auth_service.model.User;
import auth_service.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtUtil jwtUtil;

    @Autowired
    private MailService mailService;

    // Must stay false in production — see application.properties for why.
    @Value("${otp.debug-expose:false}")
    private boolean otpDebugExpose;

    private BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public User registerUser(String name, String email, String password) {
        // Emails are stored lowercase so "User@tally.com" and "user@tally.com"
        // can never become two different accounts.
        email = email.toLowerCase().trim();
        name = name.trim();

        // Password strength validation
        if (password.length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }
        if (!password.matches(".*\\d.*")) {
            throw new RuntimeException("Password must contain at least one number");
        }

        // Basic email format validation — must contain @ with a dot somewhere after it
        int atIndex = email.indexOf('@');
        if (atIndex < 1 || email.indexOf('.', atIndex) < 0) {
            throw new RuntimeException("Please enter a valid email address");
        }

        // Duplicate email check (DB unique constraint is the final backstop
        // for simultaneous registrations with the same email)
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("An account with this email already exists");
        }

        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        try {
            return userRepository.save(user);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Race: another registration with the same email won the DB write
            throw new RuntimeException("An account with this email already exists");
        }
    }

    public Map<String, Object> loginUser(String email, String password) {
        // Normalize the same way registration does
        email = email.toLowerCase().trim();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid email or password"));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new RuntimeException("Invalid email or password");
        }

        String token = jwtUtil.generateToken(user.getEmail(), user.getId());

        Map<String, Object> response = new HashMap<>();
        response.put("token", token);
        response.put("userId", user.getId());
        response.put("name", user.getName());
        response.put("email", user.getEmail());
        response.put("avatarType", user.getAvatarType());
        response.put("avatarData", user.getAvatarData());
        response.put("phoneNumber", user.getPhoneNumber() != null ? user.getPhoneNumber() : "");

        return response;
    }

    public User updateAvatar(Long userId, String avatarType, String avatarData) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setAvatarType(avatarType);
        user.setAvatarData(avatarData);
        return userRepository.save(user);
    }

    public User getUserById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    public boolean userExists(Long userId) {
        return userId != null && userRepository.existsById(userId);
    }

    public User updatePhoneNumber(Long userId, String phoneNumber) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        user.setPhoneNumber(phoneNumber);
        return userRepository.save(user);
    }

    /**
     * Generates a 6-digit OTP for password reset, stores it on the user record,
     * and emails it. The OTP is only returned to the caller when
     * otp.debug-expose is on (local dev / a demo without SMTP configured yet)
     * — see application.properties. In production, email is the only channel.
     *
     * @return the generated OTP if otp.debug-expose is on, otherwise null
     */
    public String generatePasswordResetOtp(String email) {
        email = email.toLowerCase().trim();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No account found with this email"));

        String otp = String.format("%06d", new Random().nextInt(999999));
        user.setResetOtp(otp);
        user.setResetOtpExpiry(LocalDateTime.now().plusMinutes(15));
        userRepository.save(user);

        try {
            mailService.sendPasswordResetOtp(user.getEmail(), otp);
        } catch (Exception e) {
            if (!otpDebugExpose) {
                throw new RuntimeException("Failed to send the reset email. Please try again shortly.");
            }
            // Debug mode: SMTP isn't configured yet (or is down) — don't block
            // local dev/demo, the OTP is still returned to the caller below.
            System.err.println("Password reset email failed to send (debug mode, continuing): " + e.getMessage());
        }

        return otpDebugExpose ? otp : null;
    }

    /**
     * Verifies the OTP and updates the user's password if valid.
     */
    public void verifyOtpAndResetPassword(String email, String otp, String newPassword) {
        email = email.toLowerCase().trim();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("No account found with this email"));

        if (user.getResetOtp() == null) {
            throw new RuntimeException("No password reset was requested");
        }
        if (!user.getResetOtp().equals(otp)) {
            throw new RuntimeException("Invalid OTP code");
        }
        if (LocalDateTime.now().isAfter(user.getResetOtpExpiry())) {
            throw new RuntimeException("OTP has expired. Please request a new one.");
        }

        // Validate new password strength
        if (newPassword == null || newPassword.length() < 6) {
            throw new RuntimeException("Password must be at least 6 characters");
        }
        if (!newPassword.matches(".*\\d.*")) {
            throw new RuntimeException("Password must contain at least one number");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setResetOtp(null);
        user.setResetOtpExpiry(null);
        userRepository.save(user);
    }

    /**
     * Batch user lookup for other Tally services (group-service enriches
     * members/balances with names + avatars). Display-level fields only —
     * no emails, no password hashes.
     */
    public java.util.Map<String, Object> lookupUsers(java.util.List<Long> userIds) {
        java.util.Map<String, Object> out = new java.util.HashMap<>();
        if (userIds == null || userIds.isEmpty()) return out;
        for (User u : userRepository.findAllById(userIds)) {
            java.util.Map<String, Object> entry = new java.util.HashMap<>();
            entry.put("name",       u.getName());
            entry.put("avatarType", u.getAvatarType());
            entry.put("avatarData", u.getAvatarData());
            out.put(String.valueOf(u.getId()), entry);
        }
        return out;
    }
}
