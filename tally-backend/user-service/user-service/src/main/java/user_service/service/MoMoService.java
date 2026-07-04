package user_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

@Service
public class MoMoService {

    private static final Logger log = Logger.getLogger(MoMoService.class.getName());

    @Value("${momo.subscription.key}")
    private String subscriptionKey;

    @Value("${momo.api.user}")
    private String apiUser;

    @Value("${momo.api.key}")
    private String apiKey;

    @Value("${momo.base.url}")
    private String baseUrl;

    @Value("${momo.environment}")
    private String environment;

    @Value("${momo.currency}")
    private String currency;

    @Value("${momo.callback.url}")
    private String callbackUrl;

    @Value("${momo.disbursement.subscription.key}")
    private String disbursementSubscriptionKey;

    @Value("${momo.disbursement.api.user}")
    private String disbursementApiUser;

    @Value("${momo.disbursement.api.key}")
    private String disbursementApiKey;

    @Value("${momo.disbursement.base.url}")
    private String disbursementBaseUrl;

    private final RestTemplate restTemplate = buildRestTemplate();

    private static RestTemplate buildRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(10_000); // 10 seconds
        factory.setReadTimeout(30_000);    // 30 seconds
        return new RestTemplate(factory);
    }

    /**
     * Obtain a Bearer access token from the MoMo collections API.
     */
    public String getAccessToken() {
        String credentials = apiUser + ":" + apiKey;
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", basicAuth);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> entity = new HttpEntity<>("", headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/collection/token/",
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new RuntimeException("Failed to get MoMo access token. Status: " + response.getStatusCode());
            }
            if (!response.getBody().containsKey("access_token")) {
                throw new RuntimeException("Failed to get MoMo access token: response missing access_token field");
            }

            return (String) response.getBody().get("access_token");
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("Failed to get MoMo access token: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Send a Request-to-Pay to the given MSISDN phone number.
     * Returns the referenceId on HTTP 202 Accepted.
     */
    public String requestToPay(String phoneNumber, BigDecimal amount, String description, String referenceId) {
        String token = getAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Reference-Id", referenceId);
        headers.set("X-Target-Environment", environment);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> payer = new HashMap<>();
        payer.put("partyIdType", "MSISDN");
        payer.put("partyId", phoneNumber);

        Map<String, Object> body = new HashMap<>();
        body.put("amount",       amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        body.put("currency",     currency);
        body.put("externalId",   referenceId);
        body.put("payer",        payer);
        body.put("payerMessage", description);
        body.put("payeeNote",    description);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    baseUrl + "/collection/v1_0/requesttopay",
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            if (response.getStatusCode() == HttpStatus.ACCEPTED) {
                log.info("MoMo requestToPay accepted. referenceId=" + referenceId);
                return referenceId;
            }

            throw new RuntimeException("MoMo requestToPay returned unexpected status: " + response.getStatusCode());
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("MoMo requestToPay failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Get the MoMo collection account balance.
     * Returns a map with availableBalance and currency.
     */
    public Map<String, String> getAccountBalance() {
        String token = getAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Target-Environment", environment);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/collection/v1_0/account/balance",
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            Map<String, String> result = new HashMap<>();
            if (response.getBody() != null) {
                result.put("availableBalance", String.valueOf(response.getBody().getOrDefault("availableBalance", "0")));
                result.put("currency", String.valueOf(response.getBody().getOrDefault("currency", currency)));
            } else {
                result.put("availableBalance", "0");
                result.put("currency", currency);
            }
            return result;
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("MoMo balance check failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    // ─── Disbursements (Transfer) ─────────────────────────────────────────────

    /**
     * Obtain a Bearer access token from the MoMo Disbursements API.
     */
    public String getDisbursementAccessToken() {
        String credentials = disbursementApiUser + ":" + disbursementApiKey;
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", basicAuth);
        headers.set("Ocp-Apim-Subscription-Key", disbursementSubscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> entity = new HttpEntity<>("", headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/token/",
                    HttpMethod.POST,
                    entity,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                throw new RuntimeException("Failed to get disbursement token. Status: " + response.getStatusCode());
            }
            if (!response.getBody().containsKey("access_token")) {
                throw new RuntimeException("Disbursement token response missing access_token field");
            }

            return (String) response.getBody().get("access_token");
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("Failed to get disbursement token: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Initiate a transfer (disbursement) to the given MSISDN phone number.
     * Returns the referenceId on HTTP 202 Accepted.
     */
    public String transfer(String recipientPhone, BigDecimal amount, String description, String referenceId) {
        String token = getDisbursementAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Reference-Id", referenceId);
        headers.set("X-Target-Environment", "sandbox");
        headers.set("Ocp-Apim-Subscription-Key", disbursementSubscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        Map<String, Object> payee = new HashMap<>();
        payee.put("partyIdType", "MSISDN");
        payee.put("partyId", recipientPhone);

        Map<String, Object> body = new HashMap<>();
        body.put("amount",       amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString());
        body.put("currency",     "EUR");
        body.put("externalId",   referenceId);
        body.put("payee",        payee);
        body.put("payerMessage", description);
        body.put("payeeNote",    description);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

        try {
            ResponseEntity<String> response = restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/v1_0/transfer",
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            if (response.getStatusCode() == HttpStatus.ACCEPTED) {
                log.info("MoMo transfer accepted. referenceId=" + referenceId);
                return referenceId;
            }

            throw new RuntimeException("MoMo transfer returned unexpected status: " + response.getStatusCode());
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("MoMo transfer failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Get the status of a previously initiated transfer.
     * Returns "SUCCESSFUL", "FAILED", or "PENDING".
     */
    public String getTransferStatus(String referenceId) {
        String token = getDisbursementAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Target-Environment", "sandbox");
        headers.set("Ocp-Apim-Subscription-Key", disbursementSubscriptionKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/v1_0/transfer/" + referenceId,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException("Failed to get transfer status. Status: " + response.getStatusCode());
            }

            if (response.getBody() != null && response.getBody().containsKey("status")) {
                return (String) response.getBody().get("status");
            }

            return "PENDING";
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("MoMo transfer status check failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    /**
     * Check the status of a previously submitted payment.
     * Returns "SUCCESSFUL", "FAILED", or "PENDING".
     */
    public String getPaymentStatus(String referenceId) {
        String token = getAccessToken();

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        headers.set("X-Target-Environment", environment);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);

        HttpEntity<Void> entity = new HttpEntity<>(headers);

        try {
            ResponseEntity<Map> response = restTemplate.exchange(
                    baseUrl + "/collection/v1_0/requesttopay/" + referenceId,
                    HttpMethod.GET,
                    entity,
                    Map.class
            );

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException("Failed to get payment status. Status: " + response.getStatusCode());
            }

            if (response.getBody() != null && response.getBody().containsKey("status")) {
                return (String) response.getBody().get("status");
            }

            return "PENDING";
        } catch (HttpStatusCodeException e) {
            throw new RuntimeException("MoMo status check failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }
}
