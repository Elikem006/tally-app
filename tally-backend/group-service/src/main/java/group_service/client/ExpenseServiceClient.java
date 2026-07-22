package group_service.client;

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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

/**
 * group-service's ONLY access to the expense domain: expense-service's real
 * HTTP API. Replaces both the former trimmed local copy of createExpense
 * (direct write to the expenses table) and the former duplicated MoMoService.
 * There is now exactly ONE implementation of each in the whole system —
 * inside expense-service.
 */
@Component
public class ExpenseServiceClient {

    private final RestTemplate restTemplate;

    @Value("${services.expense-url}")
    private String expenseServiceUrl;

    public ExpenseServiceClient(RestTemplate interServiceRestTemplate) {
        this.restTemplate = interServiceRestTemplate;
    }

    /**
     * POST /api/expenses — records a settlement-income expense for the member
     * who was owed money. The settlement row belongs to the OWED user, not the
     * caller, so the caller's JWT would fail expense-service's same-user check;
     * settleUp passes a service-minted token for the owed user instead (all
     * Tally services share JWT_SECRET — see the migration report).
     */
    public void createSettlementExpense(Long userId, BigDecimal amount, String category,
                                        String description, LocalDate date,
                                        String paymentMethod, String bearerToken) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + bearerToken);

        Map<String, String> body = new HashMap<>();
        body.put("userId",        String.valueOf(userId));
        body.put("amount",        amount.toPlainString());
        body.put("category",      category);
        body.put("description",   description);
        body.put("date",          date.toString());
        body.put("paymentMethod", paymentMethod);

        try {
            restTemplate.exchange(
                    expenseServiceUrl + "/api/expenses",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    new ParameterizedTypeReference<Map<String, Object>>() { });
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Expense service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Expense service rejected the settlement expense: " + e.getMessage(), e);
        }
    }

    /**
     * POST /api/momo/pay — fires the MTN request-to-pay via expense-service's
     * MoMoService (the single MoMo implementation). Caller's own JWT is
     * forwarded. Returns the response map: {referenceId, status, success, ...}.
     */
    public Map<String, Object> momoRequestToPay(String phoneNumber, BigDecimal amount,
                                                String description, String authorization) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (authorization != null) headers.set(HttpHeaders.AUTHORIZATION, authorization);

        Map<String, String> body = new HashMap<>();
        body.put("phoneNumber", phoneNumber);
        body.put("amount",      amount.toPlainString());
        body.put("description", description);

        try {
            return restTemplate.exchange(
                    expenseServiceUrl + "/api/momo/pay",
                    HttpMethod.POST,
                    new HttpEntity<>(body, headers),
                    new ParameterizedTypeReference<Map<String, Object>>() { }).getBody();
        } catch (ResourceAccessException e) {
            throw new DownstreamUnavailableException(
                    "Payment service is temporarily unavailable. Please try again shortly.", e);
        } catch (RestClientException e) {
            throw new DownstreamUnavailableException(
                    "Payment request failed: " + e.getMessage(), e);
        }
    }
}
