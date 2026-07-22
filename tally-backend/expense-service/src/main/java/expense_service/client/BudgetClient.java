package expense_service.client;

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

    @Value("${services.budget-url}")
    private String budgetServiceUrl;

    public BudgetClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    /** GET /api/budgets/user/{id} with the caller's JWT forwarded. */
    public List<Map<String, Object>> getUserBudgets(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            return restTemplate.exchange(
                    budgetServiceUrl + "/api/budgets/user/" + userId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<List<Map<String, Object>>>() { }).getBody();
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Budget service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Budget service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
