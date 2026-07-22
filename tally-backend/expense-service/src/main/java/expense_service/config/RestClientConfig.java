package expense_service.config;

import com.fasterxml.jackson.databind.DeserializationFeature;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.client.RestTemplate;

/**
 * Inter-service HTTP client. Explicit timeouts so a slow downstream service
 * fails fast (3s connect / 10s read — the report endpoint composes calls that themselves fan out, so 5s was too tight on cold starts) instead of hanging the caller thread.
 * USE_BIG_DECIMAL_FOR_FLOATS keeps monetary values as BigDecimal end-to-end,
 * so JSON passed between services re-serializes with identical decimal scale
 * (40.00 stays 40.00, never 40.0).
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
}
