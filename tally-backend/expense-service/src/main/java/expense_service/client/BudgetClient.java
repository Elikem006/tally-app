package expense_service.client;

import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;

/**
 * expense-service's ONLY access to budget data: budget-service's real API
 * (replaces the former read-only JPA mapping of the budgets table, used by
 * the monthly report's budget-performance section).
 */
@Component
public class BudgetClient {

    private final RestTemplate restTemplate;
    private final CircuitBreaker circuitBreaker;

    @Value("${services.budget-url}")
    private String budgetServiceUrl;

    public BudgetClient(RestTemplate interServiceRestTemplate, CircuitBreakerRegistry circuitBreakerRegistry) {
        this.restTemplate = interServiceRestTemplate;
        this.circuitBreaker = circuitBreakerRegistry.circuitBreaker("budget-service");
    }

    /** GET /api/budgets/user/{id} with the caller's JWT forwarded. */
    public List<Map<String, Object>> getUserBudgets(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            return circuitBreaker.executeSupplier(() -> restTemplate.exchange(
                    budgetServiceUrl + "/api/budgets/user/" + userId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<List<Map<String, Object>>>() { }).getBody());
        } catch (CallNotPermittedException e) {
            throw new DownstreamUnavailableException(
                    "Budget service is temporarily unavailable. Please try again shortly.", e);
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Budget service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Budget service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
