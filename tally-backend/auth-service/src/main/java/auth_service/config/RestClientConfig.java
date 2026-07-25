package auth_service.config;

import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;

/**
 * Inter-service HTTP client. Explicit timeouts so a slow downstream service
 * fails fast (3s connect / 10s read) instead of hanging the caller thread —
 * same budget used by every other Tally service's inter-service RestTemplate.
 *
 * circuitBreakerRegistry backs each *Client's per-downstream-service breaker:
 * once a downstream is genuinely struggling, further calls fail immediately
 * instead of every caller separately waiting out the full timeout budget.
 */
@Configuration
public class RestClientConfig {

    @Bean
    public RestTemplate interServiceRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(3000);
        factory.setReadTimeout(10000);
        return new RestTemplate(factory);
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
