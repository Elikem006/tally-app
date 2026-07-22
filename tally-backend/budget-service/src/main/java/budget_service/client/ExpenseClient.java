package budget_service.client;

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
 * budget-service's ONLY access to expense data: expense-service's real API.
 * (The former read-only JPA mapping of the expenses table has been removed —
 * a service may only touch its own tables.)
 */
@Component
public class ExpenseClient {

    private final RestTemplate restTemplate;

    @Value("${services.expense-url}")
    private String expenseServiceUrl;

    public ExpenseClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    /**
     * GET /api/expenses/user/{id} with the caller's own JWT forwarded, so
     * expense-service's auth (token validity + /user/{id} ownership) applies
     * exactly as if the mobile app had called it.
     */
    public List<Map<String, Object>> getUserExpenses(Long userId, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);
        try {
            return restTemplate.exchange(
                    expenseServiceUrl + "/api/expenses/user/" + userId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    new ParameterizedTypeReference<List<Map<String, Object>>>() { }
            ).getBody();
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Expense service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Expense service returned an unexpected error. Please try again shortly.", e);
        }
    }
}
