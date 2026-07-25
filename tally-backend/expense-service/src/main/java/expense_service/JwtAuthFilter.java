package expense_service;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Validates the JWT on every request and enforces per-user data access:
 * - No/invalid/expired token → 401 (frontend interceptor logs the user out)
 * - Any path containing /user/{id} must match the token's userId → 403 otherwise
 * - The authenticated userId is exposed as request attribute "authUserId" so
 *   controllers can verify body/query userIds via AuthGuard.
 * - Internal-service tokens (minted by another service acting on a user's
 *   behalf — see JwtUtil#isInternalServiceToken) are honored only on the
 *   narrow allowlist below and are logged as system-initiated, not treated
 *   as an indistinguishable stand-in for the user's own session.
 */
@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = Logger.getLogger(JwtAuthFilter.class.getName());
    private static final Pattern USER_PATH = Pattern.compile("/user/(\\d+)(/|$)");

    // The only endpoint a service-to-service token may drive: settle-up
    // recording a settlement expense for the owed user. Every other
    // endpoint must be reached with that user's own session token — this
    // credential is not a general "become any user" mechanism.
    private static final String INTERNAL_SERVICE_METHOD = "POST";
    private static final String INTERNAL_SERVICE_PATH = "/api/expenses";

    // MUST stay in sync with the permitAll() matchers in SecurityConfig.
    // This filter runs before Spring's authorization rules, so a path missing
    // here is rejected with 401 even when SecurityConfig permits it.
    private static final List<String> PUBLIC_PATHS = List.of(
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/health",
            "/api/auth/forgot-password",  // password reset happens while logged out
            "/api/auth/reset-password",   // password reset happens while logged out
            "/api/momo/callback"   // MoMo's servers call this — they have no JWT
    );

    private final JwtUtil jwtUtil;

    public JwtAuthFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // CORS preflight requests carry no Authorization header by design
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        return PUBLIC_PATHS.stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            reject(response, 401, "Session expired. Please log in again.");
            return;
        }

        String token = header.substring(7);
        if (!jwtUtil.validateToken(token)) {
            reject(response, 401, "Session expired. Please log in again.");
            return;
        }

        Long authUserId;
        try {
            authUserId = jwtUtil.getUserIdFromToken(token);
        } catch (Exception e) {
            reject(response, 401, "Session expired. Please log in again.");
            return;
        }
        request.setAttribute("authUserId", authUserId);

        boolean internalService;
        try {
            internalService = jwtUtil.isInternalServiceToken(token);
        } catch (Exception e) {
            internalService = false;
        }
        if (internalService) {
            boolean allowed = INTERNAL_SERVICE_METHOD.equals(request.getMethod())
                    && INTERNAL_SERVICE_PATH.equals(request.getRequestURI());
            if (!allowed) {
                reject(response, 403, "This credential is not authorized for this endpoint");
                return;
            }
            log.info("Internal-service action: system-initiated " + request.getMethod()
                    + " " + request.getRequestURI() + " on behalf of user " + authUserId);
        }
        request.setAttribute("internalServiceToken", internalService);

        // Ownership check for all /user/{id} style paths
        if (authUserId != null) {
            Matcher m = USER_PATH.matcher(request.getRequestURI());
            if (m.find()) {
                long pathUserId = Long.parseLong(m.group(1));
                if (pathUserId != authUserId) {
                    reject(response, 403, "Unauthorized: you can only access your own data");
                    return;
                }
            }
        }

        // Mark the request authenticated for Spring Security's anyRequest().authenticated()
        var authentication = new UsernamePasswordAuthenticationToken(authUserId, null, List.of());
        SecurityContextHolder.getContext().setAuthentication(authentication);

        chain.doFilter(request, response);
    }

    private void reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + message + "\",\"success\":false}");
    }
}
