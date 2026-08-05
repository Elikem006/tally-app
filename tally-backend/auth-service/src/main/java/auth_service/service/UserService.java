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
import java.util.UUID;

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

    // Public origin the emailed confirmation link points at. The gateway, not
    // this service directly — that's the address that's actually reachable.
    @Value("${app.public-base-url}")
    private String publicBaseUrl;

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

        requireValidEmailFormat(email);

        // Duplicate email check (DB unique constraint is the final backstop
        // for simultaneous registrations with the same email)
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("An account with this email already exists");
        }

        User user = new User();
        user.setName(name);
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setEmailVerified(false);
        user.setVerificationToken(newVerificationToken());
        user.setVerificationTokenExpiry(LocalDateTime.now().plusHours(VERIFICATION_TTL_HOURS));

        User saved;
        try {
            saved = userRepository.save(user);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // Race: another registration with the same email won the DB write
            throw new RuntimeException("An account with this email already exists");
        }

        // Deliberately after the commit and deliberately swallowed. Verification
        // is soft — the account is usable either way — so a Brevo outage must
        // not turn into a failed signup. Contrast generatePasswordResetOtp,
        // which DOES throw, because there the email is the entire point.
        sendVerificationEmailQuietly(saved);
        return saved;
    }

    private static final int VERIFICATION_TTL_HOURS = 24;

    private static String newVerificationToken() {
        // SecureRandom-backed and URL-safe — this value travels in a link.
        return UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
    }

    private void sendVerificationEmailQuietly(User user) {
        try {
            String link = publicBaseUrl.replaceAll("/+$", "")
                    + "/api/auth/verify-email?token=" + user.getVerificationToken();
            mailService.sendVerificationEmail(user.getEmail(), user.getName(), link);
        } catch (Exception e) {
            System.err.println("Verification email failed to send for " + user.getEmail()
                    + ": " + e.getClass().getSimpleName() + ": " + e.getMessage());
        }
    }

    /**
     * Confirms an address from the emailed link. Idempotent on the happy path:
     * a second click of an already-used link reports success rather than an
     * error, because to the person clicking it the state they wanted is true.
     *
     * @return true when this call is what flipped the flag
     */
    public boolean verifyEmailToken(String token) {
        if (token == null || token.isBlank()) {
            throw new RuntimeException("This confirmation link is not valid.");
        }
        User user = userRepository.findByVerificationToken(token).orElse(null);
        if (user == null) {
            // Either never valid, or already consumed and cleared. Can't tell
            // the two apart without keeping spent tokens around, and the
            // friendlier reading is the common one.
            throw new RuntimeException(
                    "This confirmation link has already been used or is no longer valid.");
        }
        if (user.getVerificationTokenExpiry() != null
                && LocalDateTime.now().isAfter(user.getVerificationTokenExpiry())) {
            throw new RuntimeException(
                    "This confirmation link has expired. You can request a new one from the app.");
        }

        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setVerificationTokenExpiry(null);
        userRepository.save(user);
        return true;
    }

    /**
     * Issues a fresh link. Silent about whether the address exists — this is
     * reachable while logged out, so a distinct "no such account" would make
     * it an email-enumeration oracle.
     */
    public void resendVerificationEmail(String email) {
        if (email == null || email.isBlank()) {
            throw new RuntimeException("Email is required");
        }
        User user = userRepository.findByEmail(email.toLowerCase().trim()).orElse(null);
        if (user == null || user.isEmailVerified()) {
            return;
        }
        user.setVerificationToken(newVerificationToken());
        user.setVerificationTokenExpiry(LocalDateTime.now().plusHours(VERIFICATION_TTL_HOURS));
        userRepository.save(user);
        sendVerificationEmailQuietly(user);
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
        // Drives the in-app nudge. Login is deliberately not gated on it.
        response.put("emailVerified", user.isEmailVerified());

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

    // Shared by registration and profile edit so the two can't drift apart —
    // must contain @ with a dot somewhere after it.
    private static void requireValidEmailFormat(String email) {
        int atIndex = email.indexOf('@');
        if (atIndex < 1 || email.indexOf('.', atIndex) < 0) {
            throw new RuntimeException("Please enter a valid email address");
        }
    }

    /**
     * Updates name and/or email. A null field is left untouched, so the caller
     * can send either one alone. Email is normalized and uniqueness-checked the
     * same way registration does.
     *
     * Changing the email does not invalidate the session: JwtAuthFilter
     * authorizes on the token's userId claim, and the email is only the
     * subject. The old token stays valid until it expires on its own.
     *
     * A change to the email — and only that — must be confirmed with the
     * account's current password. Email is the password-reset channel, so an
     * unconfirmed change turns temporary access to a logged-in device into
     * permanent account takeover: set the address to your own, then "forget"
     * the password. The password check is what stands in the way, since there
     * is no email-verification step to do it instead.
     */
    public User updateProfile(Long userId, String name, String email, String currentPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));
        boolean emailChanged = false;

        if (name != null) {
            String trimmed = name.trim();
            if (trimmed.isEmpty()) {
                throw new RuntimeException("Name cannot be empty");
            }
            user.setName(trimmed);
        }

        if (email != null) {
            String normalized = email.toLowerCase().trim();
            if (normalized.isEmpty()) {
                throw new RuntimeException("Email cannot be empty");
            }
            requireValidEmailFormat(normalized);

            // Only gate an actual change: re-saving the same address (or saving
            // a name while the email field rides along unchanged) shouldn't
            // demand a password.
            if (!normalized.equals(user.getEmail())) {
                if (currentPassword == null || currentPassword.isBlank()) {
                    throw new RuntimeException("Enter your current password to change your email");
                }
                if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
                    throw new RuntimeException("Incorrect password");
                }
                if (userRepository.existsByEmail(normalized)) {
                    throw new RuntimeException("An account with this email already exists");
                }
                user.setEmail(normalized);

                // The new address is unconfirmed by definition. Carrying the old
                // verified flag across would let someone launder an unowned
                // address into a verified one just by editing it.
                user.setEmailVerified(false);
                user.setVerificationToken(newVerificationToken());
                user.setVerificationTokenExpiry(LocalDateTime.now().plusHours(VERIFICATION_TTL_HOURS));
                emailChanged = true;
            }
        }

        User saved;
        try {
            saved = userRepository.save(user);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw new RuntimeException("An account with this email already exists");
        }

        // After the commit, and non-fatal: the address is already changed, so a
        // mail outage shouldn't fail the edit. Resend covers the gap.
        if (emailChanged) {
            sendVerificationEmailQuietly(saved);
        }
        return saved;
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
            // Logged unconditionally — the client-facing error is deliberately
            // generic (no SMTP/provider detail leaked to the caller), so this is
            // the only place the real cause (bad credentials, provider down,
            // connection timeout) is visible if forgot-password breaks live.
            System.err.println("Password reset email failed to send: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            if (!otpDebugExpose) {
                throw new RuntimeException("Failed to send the reset email. Please try again shortly.");
            }
            // Debug mode: SMTP isn't configured yet (or is down) — don't block
            // local dev/demo, the OTP is still returned to the caller below.
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
