package group_service;

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

    /**
     * Mints a credential for a service-to-service call made ON BEHALF OF a
     * user, distinct from that user's own session token: it carries
     * scope=internal-service and actingOnBehalfOf so the receiving service
     * can recognize, restrict and log it as a system-initiated action rather
     * than treat it as indistinguishable from the user's own request. Short
     * (2 min) expiry — minted immediately before the call it's used for.
     */
    public String generateInternalServiceToken(Long actingOnBehalfOfUserId) {
        return Jwts.builder()
                .setSubject("internal@tally.service")
                .claim("userId", actingOnBehalfOfUserId)
                .claim("scope", "internal-service")
                .claim("actingOnBehalfOf", actingOnBehalfOfUserId)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + 120_000))
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
}
