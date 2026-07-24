package auth_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * Inter-service HTTP client. Explicit timeouts so a slow downstream service
 * fails fast (3s connect / 10s read) instead of hanging the caller thread —
 * same budget used by every other Tally service's inter-service RestTemplate.
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
}
