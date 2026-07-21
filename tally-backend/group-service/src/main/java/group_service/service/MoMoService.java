package group_service.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;
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

    // ── Token caching (sandbox tokens expire ~1h; refresh after 50 min) ──────
    private static final long TOKEN_TTL_MS = 50 * 60 * 1000;
    private String cachedCollectionToken;
    private long collectionTokenExpiry = 0;
    private String cachedDisbursementToken;
    private long disbursementTokenExpiry = 0;

    // Standard RestTemplate for payments and status checks
    private final RestTemplate restTemplate = buildRestTemplate(10_000, 7_000);

    // Short-timeout RestTemplate used only for the balance endpoint
    private final RestTemplate balanceRestTemplate = buildRestTemplate(5_000, 5_000);

    private static RestTemplate buildRestTemplate(int connectTimeoutMs, int readTimeoutMs) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeoutMs);
        factory.setReadTimeout(readTimeoutMs);
        return new RestTemplate(factory);
    }

    /**
     * Retry wrapper — retries {@code maxAttempts} times on 503 or read timeout.
     * All other exceptions are rethrown immediately without retry.
     */
    private <T> T withRetry(int maxAttempts, Supplier<T> action) {
        int attempt = 0;
        while (true) {
            try {
                return action.get();
            } catch (HttpStatusCodeException e) {
                attempt++;
                int code = e.getStatusCode().value();
                // Retry on 503 (sandbox overloaded) and 500 (sandbox internal error) — both transient
                if (attempt >= maxAttempts || (code != 503 && code != 500)) throw e;
                log.warning("MoMo: " + code + " on attempt " + attempt + " — retrying in 1.2 s...");
                sleep(1200);
            } catch (ResourceAccessException e) {
                // Covers connect/read timeouts from SimpleClientHttpRequestFactory
                attempt++;
                if (attempt >= maxAttempts) throw e;
                log.warning("MoMo: timeout on attempt " + attempt + " — retrying in 1.2 s...");
                sleep(1200);
            }
        }
    }

    private static void sleep(long ms) {
        try { Thread.sleep(ms); }
        catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
    }

    /**
     * Obtain a Bearer access token from the MoMo collections API.
     */
    public String getAccessToken() {
        // Serve cached token while still fresh (< 50 min old)
        if (cachedCollectionToken != null && System.currentTimeMillis() < collectionTokenExpiry) {
            return cachedCollectionToken;
        }

        String credentials = apiUser + ":" + apiKey;
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", basicAuth);
        headers.set("Ocp-Apim-Subscription-Key", subscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> entity = new HttpEntity<>("", headers);

        try {
            log.info("MoMo: requesting fresh collection access token from " + baseUrl + "/collection/token/");
            ResponseEntity<Map> response = withRetry(2, () -> restTemplate.exchange(
                    baseUrl + "/collection/token/",
                    HttpMethod.POST,
                    entity,
                    Map.class
            ));

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.severe("MoMo: collection token request failed. Status: " + response.getStatusCode());
                throw new RuntimeException("Failed to get MoMo access token. Status: " + response.getStatusCode());
            }
            if (!response.getBody().containsKey("access_token")) {
                log.severe("MoMo: collection token response missing access_token field. Body: " + response.getBody());
                throw new RuntimeException("Failed to get MoMo access token: response missing access_token field");
            }

            String token = (String) response.getBody().get("access_token");
            cachedCollectionToken = token;
            collectionTokenExpiry = System.currentTimeMillis() + TOKEN_TTL_MS;
            log.info("MoMo: collection access token obtained and cached for 50 minutes");
            return token;
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: collection token request failed. Status: " + e.getStatusCode()
                    + " Body: " + e.getResponseBodyAsString());
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
            ResponseEntity<String> response = withRetry(2, () -> restTemplate.exchange(
                    baseUrl + "/collection/v1_0/requesttopay",
                    HttpMethod.POST,
                    entity,
                    String.class
            ));

            if (response.getStatusCode() == HttpStatus.ACCEPTED) {
                log.info("MoMo requestToPay accepted. referenceId=" + referenceId);
                return referenceId;
            }

            log.severe("MoMo: requestToPay returned unexpected status " + response.getStatusCode()
                    + " referenceId=" + referenceId);
            throw new RuntimeException("MoMo requestToPay returned unexpected status: " + response.getStatusCode());
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: requestToPay FAILED. referenceId=" + referenceId
                    + " status=" + e.getStatusCode() + " responseBody=" + e.getResponseBodyAsString());
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
            // Use short-timeout RestTemplate so a slow sandbox doesn't block the Home screen
            ResponseEntity<Map> response = balanceRestTemplate.exchange(
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
            log.severe("MoMo: balance check FAILED. status=" + e.getStatusCode()
                    + " responseBody=" + e.getResponseBodyAsString());
            throw new RuntimeException("MoMo balance check failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }

    // ─── Disbursements (Transfer) ─────────────────────────────────────────────

    /**
     * Obtain a Bearer access token from the MoMo Disbursements API.
     */
    public String getDisbursementAccessToken() {
        // Serve cached token while still fresh (< 50 min old)
        if (cachedDisbursementToken != null && System.currentTimeMillis() < disbursementTokenExpiry) {
            return cachedDisbursementToken;
        }

        String credentials = disbursementApiUser + ":" + disbursementApiKey;
        String basicAuth = "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes());

        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", basicAuth);
        headers.set("Ocp-Apim-Subscription-Key", disbursementSubscriptionKey);
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<String> entity = new HttpEntity<>("", headers);

        try {
            log.info("MoMo: requesting fresh disbursement access token from " + disbursementBaseUrl + "/disbursement/token/");
            ResponseEntity<Map> response = withRetry(2, () -> restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/token/",
                    HttpMethod.POST,
                    entity,
                    Map.class
            ));

            if (!response.getStatusCode().is2xxSuccessful() || response.getBody() == null) {
                log.severe("MoMo: disbursement token request failed. Status: " + response.getStatusCode());
                throw new RuntimeException("Failed to get disbursement token. Status: " + response.getStatusCode());
            }
            if (!response.getBody().containsKey("access_token")) {
                log.severe("MoMo: disbursement token response missing access_token field. Body: " + response.getBody());
                throw new RuntimeException("Disbursement token response missing access_token field");
            }

            String token = (String) response.getBody().get("access_token");
            cachedDisbursementToken = token;
            disbursementTokenExpiry = System.currentTimeMillis() + TOKEN_TTL_MS;
            log.info("MoMo: disbursement access token obtained and cached for 50 minutes");
            return token;
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: disbursement token request failed. Status: " + e.getStatusCode()
                    + " Body: " + e.getResponseBodyAsString());
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
            // Phone masked in logs — only last 3 digits (sensitive data hygiene)
            String maskedPhone = recipientPhone != null && recipientPhone.length() > 3
                    ? "***" + recipientPhone.substring(recipientPhone.length() - 3)
                    : "***";
            log.info("MoMo: initiating transfer. referenceId=" + referenceId
                    + " amount=" + body.get("amount") + " payee=" + maskedPhone
                    + " url=" + disbursementBaseUrl + "/disbursement/v1_0/transfer");
            ResponseEntity<String> response = withRetry(2, () -> restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/v1_0/transfer",
                    HttpMethod.POST,
                    entity,
                    String.class
            ));

            if (response.getStatusCode() == HttpStatus.ACCEPTED) {
                log.info("MoMo transfer accepted. referenceId=" + referenceId);
                return referenceId;
            }

            log.severe("MoMo: transfer returned unexpected status " + response.getStatusCode()
                    + " referenceId=" + referenceId + " body=" + response.getBody());
            throw new RuntimeException("MoMo transfer returned unexpected status: " + response.getStatusCode());
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: transfer FAILED. referenceId=" + referenceId
                    + " status=" + e.getStatusCode()
                    + " responseBody=" + e.getResponseBodyAsString());
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
            ResponseEntity<Map> response = withRetry(2, () -> restTemplate.exchange(
                    disbursementBaseUrl + "/disbursement/v1_0/transfer/" + referenceId,
                    HttpMethod.GET,
                    entity,
                    Map.class
            ));

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException("Failed to get transfer status. Status: " + response.getStatusCode());
            }

            if (response.getBody() != null && response.getBody().containsKey("status")) {
                return (String) response.getBody().get("status");
            }

            return "PENDING";
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: transfer status check FAILED. referenceId=" + referenceId
                    + " status=" + e.getStatusCode() + " responseBody=" + e.getResponseBodyAsString());
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
            ResponseEntity<Map> response = withRetry(2, () -> restTemplate.exchange(
                    baseUrl + "/collection/v1_0/requesttopay/" + referenceId,
                    HttpMethod.GET,
                    entity,
                    Map.class
            ));

            if (!response.getStatusCode().is2xxSuccessful()) {
                throw new RuntimeException("Failed to get payment status. Status: " + response.getStatusCode());
            }

            if (response.getBody() != null && response.getBody().containsKey("status")) {
                return (String) response.getBody().get("status");
            }

            return "PENDING";
        } catch (HttpStatusCodeException e) {
            log.severe("MoMo: payment status check FAILED. referenceId=" + referenceId
                    + " status=" + e.getStatusCode() + " responseBody=" + e.getResponseBodyAsString());
            throw new RuntimeException("MoMo status check failed: " + e.getStatusCode() + " — " + e.getResponseBodyAsString());
        }
    }
}
