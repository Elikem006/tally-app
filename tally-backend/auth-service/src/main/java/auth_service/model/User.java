package auth_service.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, unique = true)
    private String email;

    // NEVER serialized in API responses — defense in depth even though
    // controllers currently build response maps field-by-field.
    @JsonIgnore
    @Column(nullable = false)
    private String passwordHash;

    @Column(updatable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "avatar_type", nullable = true)
    private String avatarType;

    @Column(name = "avatar_data", columnDefinition = "TEXT", nullable = true)
    private String avatarData;

    @Column(name = "phone_number", nullable = true)
    private String phoneNumber;

    @Column(name = "reset_otp", nullable = true)
    private String resetOtp;

    @Column(name = "reset_otp_expiry", nullable = true)
    private LocalDateTime resetOtpExpiry;

    // Signup email confirmation. Verification is soft — an unverified account
    // works normally and is only nudged in-app — so nothing here gates login.
    // Accounts that predate this column were backfilled to true rather than
    // waking every existing user with a banner about an address they've been
    // using all along.
    @Column(name = "email_verified", nullable = false)
    private boolean emailVerified = false;

    @JsonIgnore
    @Column(name = "verification_token", nullable = true)
    private String verificationToken;

    @Column(name = "verification_token_expiry", nullable = true)
    private LocalDateTime verificationTokenExpiry;
}