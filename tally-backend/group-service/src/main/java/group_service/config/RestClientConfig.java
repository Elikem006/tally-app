package group_service.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Inter-service HTTP client. Explicit timeouts so a slow downstream service
 * fails fast (3s connect / 10s read — the report endpoint composes calls that themselves fan out, so 5s was too tight on cold starts) instead of hanging the caller thread.
 * USE_BIG_DECIMAL_FOR_FLOATS keeps monetary values as BigDecimal end-to-end,
 * so JSON passed between services re-serializes with identical decimal scale
 * (40.00 stays 40.00, never 40.0).
 *
 * circuitBreakerRegistry backs each *Client's per-downstream-service breaker:
 * once a downstream is genuinely struggling (half its recent calls failing),
 * further calls fail immediately (CallNotPermittedException) instead of every
 * caller separately waiting out the full 3s/10s timeout budget. Clients map
 * that the same way they already map a timeout — to a clean 503, so this is
 * purely an internal latency/thread-exhaustion improvement, not a change to
 * what callers see.
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestTemplate interServiceRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(10000);
        RestTemplate rt = new RestTemplate(factory);
        rt.getMessageConverters().stream()
                .filter(c -> c instanceof MappingJackson2HttpMessageConverter)
                .map(c -> (MappingJackson2HttpMessageConverter) c)
                .forEach(c -> c.getObjectMapper()
                        .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS));
        return rt;
    }

    @Bean
    public CircuitBreakerRegistry circuitBreakerRegistry() {
        CircuitBreakerConfig config = CircuitBreakerConfig.custom()
                .slidingWindowSize(10)
                .minimumNumberOfCalls(5)
                .failureRateThreshold(50.0f)
                .waitDurationInOpenState(Duration.ofSeconds(15))
                .permittedNumberOfCallsInHalfOpenState(3)
                .build();
        return CircuitBreakerRegistry.of(config);
    }
}
