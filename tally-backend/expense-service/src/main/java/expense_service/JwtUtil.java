package expense_service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;

@Component
public class JwtUtil {

    // Stable key derived from application.properties jwt.secret.
    // Using a fixed secret means tokens survive server restarts.
    // Must be at least 32 characters for HS256.
    @Value("${jwt.secret}")
    private String secret;

    private long expiration = 86400000; // 24 hours

    private Key getKey() {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(String email, Long userId) {
        return Jwts.builder()
                .setSubject(email)
                .claim("userId", userId)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    public String getEmailFromToken(String token) {
        return Jwts.parserBuilder()
                .setSigningKey(getKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .getSubject();
    }

    /** The userId claim embedded at login — used for per-request authorization. */
    public Long getUserIdFromToken(String token) {
        Object claim = Jwts.parserBuilder()
                .setSigningKey(getKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .get("userId");
        if (claim == null) return null;
        return Long.parseLong(String.valueOf(claim));
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder()
                    .setSigningKey(getKey())
                    .build()
                    .parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * True when this token was minted by another service acting on a user's
     * behalf (see group_service.JwtUtil#generateInternalServiceToken), not by
     * that user's own login — distinguishes system-initiated calls from the
     * user's own session so callers can restrict and log them differently.
     */
    public boolean isInternalServiceToken(String token) {
        Object claim = Jwts.parserBuilder()
                .setSigningKey(getKey())
                .build()
                .parseClaimsJws(token)
                .getBody()
                .get("scope");
        return "internal-service".equals(claim);
    }
}
