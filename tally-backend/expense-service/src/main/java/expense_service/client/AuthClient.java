package expense_service.client;

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

    @Value("${services.auth-url}")
    private String authServiceUrl;

    public AuthClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    /**
     * GET /api/auth/user/{id} with the caller's JWT forwarded (the id always
     * equals the caller here, so auth-service's same-user check passes).
     * Returns false when auth-service reports the user doesn't exist.
     */
    public boolean userExists(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            restTemplate.exchange(
                    authServiceUrl + "/api/auth/user/" + userId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    String.class);
            return true;
        } catch (HttpClientErrorException e) {
            return false; // 4xx — user not found (or token/user mismatch)
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "User service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "User service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
