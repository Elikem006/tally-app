package group_service.client;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * group-service's ONLY access to user display data (names + avatars):
 * auth-service's batch lookup API. Replaces the former read-only JPA mapping
 * of the users table.
 */
@Component
public class AuthClient {

    private final RestTemplate restTemplate;
    private final CircuitBreaker circuitBreaker;

    @Value("${services.auth-url}")
    private String authServiceUrl;

    public AuthClient(RestTemplate interServiceRestTemplate, CircuitBreakerRegistry circuitBreakerRegistry) {
        this.restTemplate = interServiceRestTemplate;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("auth-service");
    }

    /**
     * POST /api/auth/users/lookup with the caller's JWT forwarded.
     * Returns userId(String) -> {name, avatarType, avatarData}.
     */
    public Map<String, Map<String, Object>> lookupUsers(Collection<Long> userIds, String authorization) {
        if (userIds == null || userIds.isEmpty()) return new HashMap<>();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);

        Map<String, List<Long>> body = Map.of("userIds", List.copyOf(userIds));
        try {
            Map<String, Map<String, Object>> out = circuitBreaker.executeSupplier(() -> restTemplate.exchange(
                    authServiceUrl + "/api/auth/users/lookup",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    new ParameterizedTypeReference<Map<String, Map<String, Object>>>() { }).getBody());
            return out != null ? out : new HashMap<>();
        } catch (CallNotPermittedException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "User lookup failed: " + e.getMessage(), e);
        }
    }

    /**
     * GET /api/auth/users/{userId}/exists with the caller's JWT forwarded.
     * The only application-level guard against fabricated group members now
     * that the database has no foreign key to auth-service's users table —
     * see GroupService.addMember.
     */
    public boolean userExists(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            Map<String, Object> body = circuitBreaker.executeSupplier(() -> restTemplate.exchange(
                    authServiceUrl + "/api/auth/users/" + userId + "/exists",
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<Map<String, Object>>() { }).getBody());
            return body != null && Boolean.TRUE.equals(body.get("exists"));
        } catch (CallNotPermittedException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "User existence check failed: " + e.getMessage(), e);
        }
    }
}
