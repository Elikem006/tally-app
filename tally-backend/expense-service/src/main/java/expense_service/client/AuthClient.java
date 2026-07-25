package expense_service.client;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * expense-service's ONLY access to user data: auth-service's API (replaces
 * the former read-only JPA mapping of the users table, used by
 * ReminderService's user-existence check).
 */
@Component
public class AuthClient {

    private final RestTemplate restTemplate;
    private final CircuitBreaker circuitBreaker;

    @Value("${services.auth-url}")
    private String authServiceUrl;

    public AuthClient(RestTemplate interServiceRestTemplate, CircuitBreakerRegistry circuitBreakerRegistry) {
        this.restTemplate = interServiceRestTemplate;
        // A 4xx here is a valid "user not found" business answer from a
        // healthy auth-service, not an infrastructure failure — excluded so
        // a burst of legitimate not-found checks can't trip the breaker.
        CircuitBreakerConfig config = CircuitBreakerConfig.from(circuitBreakerRegistry.getDefaultConfig())
                .ignoreExceptions(HttpClientErrorException.class)
                .build();
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("auth-service", config);
    }

    /**
     * GET /api/auth/user/{id} with the caller's JWT forwarded (the id always
     * equals the caller here, so auth-service's same-user check passes).
     * Returns false when auth-service reports the user doesn't exist.
     * A 4xx (HttpClientErrorException) is a real "not found" answer from a
     * healthy auth-service, not a failure — it must not trip the breaker or
     * be swallowed by the circuit-breaker wrapper, so it's thrown from
     * inside the supplier and caught outside, same as before.
     */
    public boolean userExists(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            circuitBreaker.executeRunnable(() -> restTemplate.exchange(
                    authServiceUrl + "/api/auth/user/" + userId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class));
            return true;
        } catch (HttpClientErrorException e) {
            return false; // 4xx — user not found (or token/user mismatch)
        } catch (CallNotPermittedException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "User service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
